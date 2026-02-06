"""add default_category_id to payees

Revision ID: 20260206_1520
Revises: 
Create Date: 2026-02-06 15:20:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260206_1520'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('payees', sa.Column('default_category_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_payees_default_category_id',
        'payees',
        'categories',
        ['default_category_id'],
        ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_payees_default_category_id', 'payees', type_='foreignkey')
    op.drop_column('payees', 'default_category_id')
