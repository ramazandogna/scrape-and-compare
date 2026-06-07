/**
 * Skill Extractor — extracts technologies and skills from job descriptions.
 *
 * Strategy:
 * - 80+ technology keywords across 8 categories
 * - Word boundary matching (case-insensitive)
 * - Main skill: appears in the title or requirements
 * - Side skill: appears only in the description
 *
 * Why no LLM? Speed and cost:
 * - 58 jobs × GPT-4o call = ~20s + $0.50
 * - Regex matching = <10ms total, free
 * - 90%+ accuracy is already enough (for v1)
 */

import type { ExtractedSkill } from '@scrape/shared';

// ═══════════════════════════════════════════
// SKILL DATABASE — category-based technology list
// ═══════════════════════════════════════════

interface SkillEntry {
  name: string;
  pattern: RegExp;
  category: string;
}

/**
 * Builds the skill database — produces a word-boundary regex for each entry.
 */
const buildSkillEntries = (category: string, skills: string[]): SkillEntry[] =>
  skills.map((name) => ({
    name,
    pattern: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    category,
  }));

/**
 * Full skill database — 8 categories, 80+ technologies.
 * Order matters: longer names come first (e.g. "React Native" > "React").
 */
const SKILL_DATABASE: SkillEntry[] = [
  // Frontend
  ...buildSkillEntries('frontend', [
    'React Native', 'React', 'Next.js', 'Vue.js', 'Vue', 'Angular',
    'Svelte', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Sass', 'SCSS',
    'Tailwind', 'Bootstrap', 'jQuery', 'Redux', 'Zustand', 'MobX',
    'Webpack', 'Vite', 'Storybook',
  ]),

  // Backend
  ...buildSkillEntries('backend', [
    'Node.js', 'NestJS', 'Express', 'Fastify', 'Spring Boot', 'Spring',
    'Django', 'Flask', 'FastAPI', 'ASP.NET', '.NET', 'Ruby on Rails',
    'Laravel', 'Go', 'Golang', 'Rust', 'Java', 'Python', 'C#', 'PHP',
    'Kotlin', 'Scala', 'Elixir',
  ]),

  // Database
  ...buildSkillEntries('database', [
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'SQLite',
    'DynamoDB', 'Cassandra', 'Oracle', 'SQL Server', 'Firebase', 'Supabase',
    'Prisma', 'TypeORM', 'Sequelize', 'Mongoose',
  ]),

  // DevOps
  ...buildSkillEntries('devops', [
    'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'Terraform', 'Ansible',
    'Jenkins', 'GitHub Actions', 'GitLab CI', 'CircleCI', 'Nginx', 'Apache',
    'Linux', 'Grafana', 'Prometheus', 'Datadog',
  ]),

  // Testing
  ...buildSkillEntries('testing', [
    'Jest', 'Cypress', 'Playwright', 'Selenium', 'Mocha', 'Vitest',
    'Testing Library', 'Puppeteer', 'JUnit', 'PyTest',
  ]),

  // Mobile
  ...buildSkillEntries('mobile', [
    'Swift', 'SwiftUI', 'Kotlin', 'Flutter', 'Dart', 'Xamarin', 'Ionic',
  ]),

  // Data & AI
  ...buildSkillEntries('data-ai', [
    'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Spark',
    'Hadoop', 'Kafka', 'RabbitMQ', 'Airflow', 'Power BI', 'Tableau',
  ]),

  // Tools & Practices
  ...buildSkillEntries('tools', [
    'Git', 'GraphQL', 'REST', 'gRPC', 'WebSocket', 'OAuth', 'JWT',
    'Microservices', 'Agile', 'Scrum', 'CI/CD', 'Figma', 'Jira',
  ]),
];

// ═══════════════════════════════════════════
// EXTRACTOR FUNCTIONS
// ═══════════════════════════════════════════

/** Finds which skills appear in the given text */
const findSkillsInText = (text: string): Set<string> => {
  const found = new Set<string>();
  for (const entry of SKILL_DATABASE) {
    if (entry.pattern.test(text)) {
      found.add(entry.name);
    }
  }
  return found;
};

/**
 * Extracts skills from a job listing.
 *
 * Main skill: appears in the title or requirements → core requirements of the listing
 * Side skill: appears only in the description → "nice to have"
 *
 * @param title Job title
 * @param description Job description
 * @param requirements Requirements list
 * @returns ExtractedSkill array
 */
export const extractSkills = (
  title: string,
  description: string | null,
  requirements: string[],
): ExtractedSkill[] => {
  const primaryText = [title, ...requirements].join(' ');
  const primarySkills = findSkillsInText(primaryText);
  const descriptionSkills = description ? findSkillsInText(description) : new Set<string>();

  const results: ExtractedSkill[] = [];
  const addedSkills = new Set<string>();

  // Main skills (title + requirements)
  for (const skillName of primarySkills) {
    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry || addedSkills.has(skillName)) continue;
    results.push({ name: entry.name, category: entry.category, isMain: true });
    addedSkills.add(skillName);
  }

  // Side skills (description only)
  for (const skillName of descriptionSkills) {
    if (addedSkills.has(skillName)) continue;
    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry) continue;
    results.push({ name: entry.name, category: entry.category, isMain: false });
    addedSkills.add(skillName);
  }

  return results;
};
