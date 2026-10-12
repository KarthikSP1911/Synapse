import { SKILLS, isSkill, type Skill } from "./types";

/** Each skill has its own page: the options, the session panel and the Start button. `/` only lists the skills. */
export const skillHref = (skill: Skill): string => `/skills/${skill}`;

/** Every skill page, for the service worker and anything else that needs to list them. */
export const SKILL_PATHS: readonly string[] = SKILLS.map(skillHref);

/** The skill a `/skills/<skill>` URL names, or null for anything that is not one of the eight. */
export const parseSkillParam = (value: unknown): Skill | null => (isSkill(value) ? value : null);

/**
 * Where an old `/?skill=<skill>` link goes. It used to select a skill on the home page; skills now have their own
 * pages. Anything else (no value, an unknown skill, a repeated parameter) stays on the hub.
 */
export const legacySkillRedirect = (param: string | string[] | undefined): string | null => {
  const skill = parseSkillParam(param);
  return skill ? skillHref(skill) : null;
};
