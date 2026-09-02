import type { MaterialTopic, StudyProfile, TopicStudyProfile } from "@proxus/shared";

export type NextStudyAction =
  | { readonly kind: "finish-setup"; readonly target: "index" | "notes" }
  | { readonly kind: "first-control"; readonly topicId: string; readonly topicLabel: string }
  | {
      readonly kind: "review";
      readonly topicId: string;
      readonly topicLabel: string;
      readonly reason: "incorrect" | "hint" | "emphasis";
      readonly count: number | null;
    }
  | { readonly kind: "new-practice" }
  | { readonly kind: "no-data"; readonly reason: string };

export interface NextStudyActionInput {
  readonly hasIndex: boolean;
  readonly hasNote: boolean;
  readonly topics: readonly MaterialTopic[] | null;
  readonly profile: StudyProfile | null;
}

const firstPage = (topic: MaterialTopic): number =>
  topic.pages.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...topic.pages);

const leafTopicsByPage = (topics: readonly MaterialTopic[]): readonly MaterialTopic[] => {
  const parentIds = new Set(
    topics.flatMap((topic) => topic.parentId === null ? [] : [topic.parentId]),
  );
  return topics
    .map((topic, position) => ({ topic, position }))
    .filter(({ topic }) => !parentIds.has(topic.id))
    .sort((a, b) => firstPage(a.topic) - firstPage(b.topic) || a.position - b.position)
    .map(({ topic }) => topic);
};

const maxStable = (
  topics: readonly TopicStudyProfile[],
  valueOf: (topic: TopicStudyProfile) => number,
): TopicStudyProfile | undefined => {
  let winner: TopicStudyProfile | undefined;
  let maximum = 0;
  for (const topic of topics) {
    const value = valueOf(topic);
    if (value > maximum) {
      winner = topic;
      maximum = value;
    }
  }
  return winner;
};

export const nextStudyAction = ({
  hasIndex,
  hasNote,
  topics,
  profile,
}: NextStudyActionInput): NextStudyAction => {
  if (!hasIndex) {
    return { kind: "finish-setup", target: "index" };
  }
  if (!hasNote) {
    return { kind: "finish-setup", target: "notes" };
  }
  if (topics === null || profile === null) {
    return { kind: "no-data", reason: "No hay datos suficientes todavía." };
  }

  const leaves = leafTopicsByPage(topics);
  if (leaves.length === 0) {
    return { kind: "no-data", reason: "El material no tiene un tema disponible para practicar." };
  }

  if (profile.updatedAt === null) {
    const first = leaves[0]!;
    return { kind: "first-control", topicId: first.id, topicLabel: first.label };
  }

  const leafIds = new Set(leaves.map((topic) => topic.id));
  const currentTopics = profile.topics.filter((topic) => leafIds.has(topic.topicId));
  const incorrect = maxStable(currentTopics, (topic) => topic.incorrect);
  if (incorrect !== undefined) {
    return {
      kind: "review",
      topicId: incorrect.topicId,
      topicLabel: incorrect.topicLabel,
      reason: "incorrect",
      count: incorrect.incorrect,
    };
  }

  const hint = maxStable(currentTopics, (topic) => topic.hintsRevealed);
  if (hint !== undefined) {
    return {
      kind: "review",
      topicId: hint.topicId,
      topicLabel: hint.topicLabel,
      reason: "hint",
      count: hint.hintsRevealed,
    };
  }

  const emphasis = currentTopics.find((topic) => topic.emphasis);
  if (emphasis !== undefined) {
    return {
      kind: "review",
      topicId: emphasis.topicId,
      topicLabel: emphasis.topicLabel,
      reason: "emphasis",
      count: null,
    };
  }

  return { kind: "new-practice" };
};

// Ordena por la misma jerarquía de decisión sin producir un score compuesto. Los empates conservan
// el orden del perfil, que a su vez sigue el índice del material.
export const orderTopicsForStudy = (
  topics: readonly TopicStudyProfile[],
): readonly TopicStudyProfile[] =>
  topics
    .map((topic, position) => ({ topic, position }))
    .sort((a, b) => {
      const groupOf = (topic: TopicStudyProfile): number => {
        if (topic.incorrect > 0) return 0;
        if (topic.hintsRevealed > 0) return 1;
        if (topic.emphasis) return 2;
        return 3;
      };
      const group = groupOf(a.topic) - groupOf(b.topic);
      if (group !== 0) return group;
      if (groupOf(a.topic) === 0) return b.topic.incorrect - a.topic.incorrect || a.position - b.position;
      if (groupOf(a.topic) === 1) return b.topic.hintsRevealed - a.topic.hintsRevealed || a.position - b.position;
      return a.position - b.position;
    })
    .map(({ topic }) => topic);
