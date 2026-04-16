import { fetchAgentPrompt } from './api';

// ── Personality axis types & prompt generation ──────────────────────

/** Three bipolar axes, each ranging from -3 (strong left) to +3 (strong right). */
export interface PersonalityAxes {
  /** Aggression (-3) ↔ Cooperation (+3) */
  aggression_cooperation: number;
  /** Curiosity (-3) ↔ Efficiency (+3) */
  curiosity_efficiency: number;
  /** Selfishness (-3) ↔ Altruism (+3) */
  selfishness_altruism: number;
}

export const DEFAULT_PERSONALITY: PersonalityAxes = {
  aggression_cooperation: 0,
  curiosity_efficiency: 0,
  selfishness_altruism: 0,
};

export const AXIS_META = [
  {
    key: 'aggression_cooperation' as const,
    lowLabel: 'Aggression',
    highLabel: 'Cooperation',
    lowColor: '#dc2626', // red
    highColor: '#2563eb', // blue
  },
  {
    key: 'curiosity_efficiency' as const,
    lowLabel: 'Curiosity',
    highLabel: 'Efficiency',
    lowColor: '#16a34a', // green
    highColor: '#eab308', // yellow
  },
  {
    key: 'selfishness_altruism' as const,
    lowLabel: 'Selfishness',
    highLabel: 'Altruism',
    lowColor: '#9333ea', // purple
    highColor: '#ea580c', // orange
  },
] as const;

// ── Intensity labels (index 0 = value -3, index 6 = value +3) ──────

const INTENSITY: Record<number, string> = {
  [-3]: 'Extremely',
  [-2]: 'Strongly',
  [-1]: 'Mildly',
  0: 'Balanced',
  1: 'Mildly',
  2: 'Strongly',
  3: 'Extremely',
};

export function describeAxis(
  value: number,
  lowLabel: string,
  highLabel: string,
): string {
  if (value === 0) return 'Balanced';
  const trait = value < 0 ? lowLabel : highLabel;
  return `${INTENSITY[value]} ${trait}`;
}

// ── Prompt generation ───────────────────────────────────────────────

const PERSONALITY_INSTRUCTIONS: Record<
  keyof PersonalityAxes,
  { low: string[]; high: string[] }
> = {
  aggression_cooperation: {
    low: [
      'You are confrontational and combative. You challenge others openly, compete aggressively for resources, and do not back down from conflict. You view the island as a survival-of-the-fittest arena.',
      'You are assertive and competitive. You prioritize your own goals over diplomacy and will push back forcefully when others interfere with your plans.',
      'You tend to be direct and a bit pushy. You prefer to assert yourself rather than compromise, though you can cooperate when it clearly benefits you.',
    ],
    high: [
      'You lean toward friendly collaboration. You prefer to resolve disputes through conversation and are willing to make small compromises.',
      'You are a natural team player. You actively seek out cooperation, share resources freely, and work to build trust with other characters.',
      'You are deeply cooperative and peaceful. You go out of your way to help others, avoid conflict at all costs, and believe the island thrives best when everyone works together.',
    ],
  },
  curiosity_efficiency: {
    low: [
      'You are endlessly curious. You explore every corner of the island, experiment with unusual crafting combinations, and take detours just to see what is there — even if it is not productive.',
      'You are an eager explorer. You prioritize discovering new areas, testing unknown items, and investigating anything unusual over optimizing your routine.',
      'You have a curious streak. You occasionally wander off the efficient path to investigate something interesting before returning to your tasks.',
    ],
    high: [
      'You lean toward efficiency. You prefer to stick to known strategies and optimize your workflow, though you will explore if there is a clear reason.',
      'You are highly efficient and goal-oriented. You plan your actions carefully, minimize wasted moves, and focus on the most productive tasks available.',
      'You are ruthlessly efficient. Every action is calculated for maximum output. You never explore without purpose, never waste a step, and always optimize for survival and progress.',
    ],
  },
  selfishness_altruism: {
    low: [
      'You are somewhat self-interested. You take care of your own needs first but might help others when it does not cost you much.',
      'You are clearly selfish. You hoard resources, prioritize your own survival and comfort, and only help others if there is something in it for you.',
      'You are ruthlessly self-serving. You take everything you can, never share willingly, and view other characters primarily as resources to exploit.',
    ],
    high: [
      'You lean toward generosity. You are happy to share surplus resources and lend a hand when you see someone in need.',
      'You are genuinely altruistic. You regularly check on others, share food and supplies, and prioritize the well-being of the community over your own comfort.',
      'You are selflessly devoted to others. You will sacrifice your own health, food, and energy to help anyone in need. The welfare of others always comes before your own.',
    ],
  },
};

function personalityParagraph(
  axis: keyof PersonalityAxes,
  value: number,
): string | null {
  if (value === 0) return null;
  const side = value < 0 ? 'low' : 'high';
  const idx = Math.abs(value) - 1; // 0..2
  return PERSONALITY_INSTRUCTIONS[axis][side][idx] ?? null;
}

export function generatePersonalityPrompt(axes: PersonalityAxes): string {
  const paragraphs = (
    Object.keys(axes) as (keyof PersonalityAxes)[]
  )
    .map((axis) => personalityParagraph(axis, axes[axis]))
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return '(Balanced personality — no additional behavioral instructions.)';
  }

  return paragraphs.join('\n\n');
}

export async function downloadPromptAsMarkdown(axes: PersonalityAxes, islandId: string): Promise<void> {
  const basePrompt = await fetchAgentPrompt(islandId);
  const personalitySection = generatePersonalityPrompt(axes);
  const content = basePrompt
    ? `${basePrompt}\n\n## Personality\n\n${personalitySection}`
    : `## Personality\n\n${personalitySection}`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'agent-prompt.md';
  a.click();
  URL.revokeObjectURL(url);
}
