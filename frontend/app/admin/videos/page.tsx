"use client";
import { ModerationList } from "@/components/moderation-list";
import { PageHeader } from "@/components/ui";

export default function AdminVideos() {
  return (
    <>
      <PageHeader title="Videos" subtitle="All uploaded videos. Approve, reject, hide or restore." />
      <ModerationList type="video" initialStatus="all" />
    </>
  );
}
