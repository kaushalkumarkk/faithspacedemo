"""thumbnails, duration and user blocks

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-11 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'user_blocks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('blocker_id', sa.Integer(), nullable=False),
        sa.Column('blocked_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['blocked_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['blocker_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('blocker_id', 'blocked_id', name='uq_block_pair'),
    )
    with op.batch_alter_table('user_blocks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_blocks_blocked_id'), ['blocked_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_user_blocks_blocker_id'), ['blocker_id'], unique=False)

    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.add_column(sa.Column('thumbnail_asset_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('duration_seconds', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_video_thumbnail', 'media_assets', ['thumbnail_asset_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.drop_constraint('fk_video_thumbnail', type_='foreignkey')
        batch_op.drop_column('duration_seconds')
        batch_op.drop_column('thumbnail_asset_id')

    with op.batch_alter_table('user_blocks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_blocks_blocker_id'))
        batch_op.drop_index(batch_op.f('ix_user_blocks_blocked_id'))

    op.drop_table('user_blocks')
