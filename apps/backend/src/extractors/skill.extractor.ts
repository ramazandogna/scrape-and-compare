/**
 * Skill Extractor — Job description'larından teknoloji ve yetenek çıkarır.
 *
 * Strateji:
 * - 80+ teknoloji keyword'ü, 8 kategoride
 * - Word boundary matching (case-insensitive)
 * - Main skill: title veya requirements'da geçen
 * - Side skill: sadece description'da geçen
 *
 * Neden LLM kullanmıyoruz? Hız ve maliyet:
 * - 58 job × GPT-4o call = ~20sn + $0.50
 * - Regex matching = <10ms total, ücretsiz
 * - %90+ accuracy zaten yeterli (v1 için)
 */

import type { ExtractedSkill } from '@scrape/shared';

// ═══════════════════════════════════════════
// SKILL DATABASE — Kategori bazlı teknoloji listesi
// ═══════════════════════════════════════════

interface SkillEntry {
  name: string;
  pattern: RegExp;
  category: string;
}

/**
 * Skill veritabanı oluşturur — her entry için word boundary regex üretir.
 */
const buildSkillEntries = (category: string, skills: string[]): SkillEntry[] =>
  skills.map((name) => ({
    name,
    pattern: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    category,
  }));

/**
 * Tüm skill veritabanı — 8 kategori, 80+ teknoloji.
 * Sıralama önemli: uzun isimler önce gelir (ör: "React Native" > "React")
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
// EXTRACTOR FONKSİYONLARI
// ═══════════════════════════════════════════

/** Verilen text içinde hangi skill'lerin geçtiğini bulur */
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
 * Bir job listing'den skill'leri çıkarır.
 *
 * Main skill: title veya requirements'da geçen → ilanın ana gereksinimleri
 * Side skill: sadece description'da geçen → "nice to have"
 *
 * @param title Job başlığı
 * @param description Job açıklaması
 * @param requirements Gereksinimler listesi
 * @returns ExtractedSkill dizisi
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

  // Main skill'ler (title + requirements)
  for (const skillName of primarySkills) {
    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry || addedSkills.has(skillName)) continue;
    results.push({ name: entry.name, category: entry.category, isMain: true });
    addedSkills.add(skillName);
  }

  // Side skill'ler (sadece description)
  for (const skillName of descriptionSkills) {
    if (addedSkills.has(skillName)) continue;
    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry) continue;
    results.push({ name: entry.name, category: entry.category, isMain: false });
    addedSkills.add(skillName);
  }

  return results;
};
