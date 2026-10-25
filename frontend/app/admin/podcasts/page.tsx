"use client";
import { ModerationList } from "@/components/moderation-list";
import { PageHeader } from "@/components/ui";

export default function AdminPodcasts() {
  return (
    <>
      <PageHeader title="Podcast episodes" subtitle="All uploaded episodes. Approve, reject, hide or restore." />
      <ModerationList type="episode" initialStatus="all" />
    </>
  );
}
