"""Match an RFQ to the suppliers that should be notified about it."""
from sqlalchemy.orm import Session

from ..models import RFQ, Category, Product, Supplier


def rfq_category_ids(db: Session, rfq: RFQ) -> list[int]:
    pids = [i.product_id for i in rfq.items if i.product_id]
    if not pids:
        return list(rfq.category_ids or [])
    cat_ids = {c for (c,) in db.query(Product.category_id).filter(Product.id.in_(pids)).all()}
    parents = {c.parent_id for c in db.query(Category).filter(Category.id.in_(cat_ids)).all() if c.parent_id}
    return sorted(cat_ids | parents | set(rfq.category_ids or []))


def matching_suppliers(db: Session, rfq: RFQ) -> list[Supplier]:
    """Registered suppliers whose categories overlap the RFQ (or all registered ones when no category data)."""
    suppliers = db.query(Supplier).filter(Supplier.is_external.is_(False), Supplier.user_id.isnot(None)).all()
    wanted = set(rfq_category_ids(db, rfq))
    if not wanted:
        return suppliers
    out = []
    for s in suppliers:
        cats = set(s.category_ids or [])
        if not cats or cats & wanted:
            out.append(s)
    return out
