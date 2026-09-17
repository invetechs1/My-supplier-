"""File storage for uploads: local disk (served at /uploads) or S3-compatible object storage."""
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .. import config

_MAGIC = {
    b"\x89PNG": ("png", "image/png"),
    b"\xff\xd8\xff": ("jpg", "image/jpeg"),
    b"RIFF": ("webp", "image/webp"),
    b"%PDF": ("pdf", "application/pdf"),
    b"GIF8": ("gif", "image/gif"),
}


def sniff(data: bytes, allow: tuple[str, ...]) -> tuple[str, str]:
    for magic, (ext, mime) in _MAGIC.items():
        if data.startswith(magic):
            if ext == "webp" and data[8:12] != b"WEBP":
                continue
            if ext not in allow:
                raise HTTPException(400, f"File type .{ext} is not allowed here")
            return ext, mime
    raise HTTPException(400, "Unsupported file type — use PNG, JPG, WEBP or PDF")


async def read_upload(file: UploadFile, allow: tuple[str, ...] = ("png", "jpg", "webp")) -> tuple[bytes, str, str]:
    data = await file.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File larger than {config.MAX_UPLOAD_MB} MB")
    if not data:
        raise HTTPException(400, "Empty file")
    ext, mime = sniff(data, allow)
    return data, ext, mime


def save(data: bytes, ext: str, mime: str, folder: str) -> str:
    """Persist bytes and return a public URL."""
    name = f"{folder}/{secrets.token_hex(12)}.{ext}"
    if config.STORAGE_BACKEND == "s3":
        import boto3
        kwargs = {"region_name": config.S3_REGION}
        if config.S3_ENDPOINT:
            kwargs["endpoint_url"] = config.S3_ENDPOINT
        s3 = boto3.client("s3", **kwargs)
        s3.put_object(Bucket=config.S3_BUCKET, Key=name, Body=data, ContentType=mime, ACL="public-read")
        base = config.S3_PUBLIC_BASE or (f"{config.S3_ENDPOINT}/{config.S3_BUCKET}" if config.S3_ENDPOINT else f"https://{config.S3_BUCKET}.s3.{config.S3_REGION}.amazonaws.com")
        return f"{base.rstrip('/')}/{name}"
    path = Path(config.UPLOADS_DIR) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"{config.PUBLIC_BASE_URL}/uploads/{name}"
