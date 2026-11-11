"""guest accounts, video view counts and bookmarks

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-11 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_guest', sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.add_column(sa.Column('view_count', sa.Integer(), nullable=False, server_default='0'))
    op.create_table(
        'bookmarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('video_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['video_id'], ['videos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'video_id', name='uq_bookmark_user_video'),
    )
    with op.batch_alter_table('bookmarks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_bookmarks_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_bookmarks_video_id'), ['video_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('bookmarks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_bookmarks_video_id'))
        batch_op.drop_index(batch_op.f('ix_bookmarks_user_id'))
    op.drop_table('bookmarks')
    with op.batch_alter_table('videos', schema=None) as batch_op:
        batch_op.drop_column('view_count')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_guest')
