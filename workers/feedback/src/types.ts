export type FeedbackKind = "bug" | "request" | "question";

export type FeedbackInput = {
  id: string;
  submittedAt: string;
  kind: FeedbackKind;
  summary: string;
  details: string;
  steps?: string;
  expected?: string;
  actual?: string;
  context?: string;
};

export type OrganizedFeedback = {
  title: string;
  category: FeedbackKind;
  summary: string;
  steps: string[];
  expected?: string;
  actual?: string;
  labels: string[];
  needsHumanReview: boolean;
};
