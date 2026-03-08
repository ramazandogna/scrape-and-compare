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

import type { ExtractedSkill } from '@/models/job.model';

// ═══════════════════════════════════════════
// SKILL DATABASE — Kategori bazlı teknoloji listesi
// ═══════════════════════════════════════════

interface SkillEntry {
  /** Skill adı (normalize edilmiş) */
  name: string;
  /** Regex pattern (case-insensitive match) */
  pattern: RegExp;
  /** Kategori */
  category: string;
}

/**
 * Skill veritabanı oluşturur — her entry için word boundary regex üretir.
 *
 * @param category Kategori adı
 * @param skills Skill adları (case-insensitive match yapılır)
 * @returns SkillEntry dizisi
 */
const buildSkillEntries = (category: string, skills: string[]): SkillEntry[] =>
  skills.map((name) => ({
    name,
    // Özel karakterleri escape et, word boundary ile sarmala
    pattern: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
    category,
  }));

/**
 * Tüm skill veritabanı — 8 kategori, 80+ teknoloji.
 * Sıralama önemli: uzun isimler önce gelir (ör: "React Native" > "React")
 */
const SKILL_DATABASE: SkillEntry[] = [
  // Frontend — UI framework ve araçları
  ...buildSkillEntries('frontend', [
    'React Native',
    'React',
    'Next.js',
    'Vue.js',
    'Vue',
    'Angular',
    'Svelte',
    'TypeScript',
    'JavaScript',
    'HTML',
    'CSS',
    'Sass',
    'SCSS',
    'Tailwind',
    'Bootstrap',
    'jQuery',
    'Redux',
    'Zustand',
    'MobX',
    'Webpack',
    'Vite',
    'Storybook',
  ]),

  // Backend — Sunucu framework ve runtime
  ...buildSkillEntries('backend', [
    'Node.js',
    'NestJS',
    'Express',
    'Fastify',
    'Spring Boot',
    'Spring',
    'Django',
    'Flask',
    'FastAPI',
    'ASP.NET',
    '.NET',
    'Ruby on Rails',
    'Laravel',
    'Go',
    'Golang',
    'Rust',
    'Java',
    'Python',
    'C#',
    'PHP',
    'Kotlin',
    'Scala',
    'Elixir',
  ]),

  // Database — Veritabanı teknolojileri
  ...buildSkillEntries('database', [
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'Elasticsearch',
    'SQLite',
    'DynamoDB',
    'Cassandra',
    'Oracle',
    'SQL Server',
    'Firebase',
    'Supabase',
    'Prisma',
    'TypeORM',
    'Sequelize',
    'Mongoose',
  ]),

  // DevOps — Altyapı ve CI/CD
  ...buildSkillEntries('devops', [
    'Docker',
    'Kubernetes',
    'AWS',
    'Azure',
    'GCP',
    'Terraform',
    'Ansible',
    'Jenkins',
    'GitHub Actions',
    'GitLab CI',
    'CircleCI',
    'Nginx',
    'Apache',
    'Linux',
    'Grafana',
    'Prometheus',
    'Datadog',
  ]),

  // Testing — Test framework ve araçları
  ...buildSkillEntries('testing', [
    'Jest',
    'Cypress',
    'Playwright',
    'Selenium',
    'Mocha',
    'Vitest',
    'Testing Library',
    'Puppeteer',
    'JUnit',
    'PyTest',
  ]),

  // Mobile — Mobil geliştirme
  ...buildSkillEntries('mobile', [
    'Swift',
    'SwiftUI',
    'Kotlin',
    'Flutter',
    'Dart',
    'Xamarin',
    'Ionic',
  ]),

  // Data & AI — Veri bilimi ve yapay zeka
  ...buildSkillEntries('data-ai', [
    'TensorFlow',
    'PyTorch',
    'Pandas',
    'NumPy',
    'Scikit-learn',
    'Spark',
    'Hadoop',
    'Kafka',
    'RabbitMQ',
    'Airflow',
    'Power BI',
    'Tableau',
  ]),

  // Tools & Practices — Genel araç ve metodolojiler
  ...buildSkillEntries('tools', [
    'Git',
    'GraphQL',
    'REST',
    'gRPC',
    'WebSocket',
    'OAuth',
    'JWT',
    'Microservices',
    'Agile',
    'Scrum',
    'CI/CD',
    'Figma',
    'Jira',
  ]),
];

// ═══════════════════════════════════════════
// EXTRACTOR FONKSİYONLARI
// ═══════════════════════════════════════════

/**
 * Verilen text içinde hangi skill'lerin geçtiğini bulur.
 *
 * @param text Aranacak metin
 * @returns Bulunan skill adları seti
 */
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
 * Side skill: sadece description'da geçen → "nice to have" veya ekosistem bilgisi
 *
 * @param title Job başlığı
 * @param description Job açıklaması (tam metin)
 * @param requirements Gereksinimler listesi
 * @returns ExtractedSkill dizisi (main + side)
 */
export const extractSkills = (
  title: string,
  description: string | null,
  requirements: string[],
): ExtractedSkill[] => {
  // Title ve requirements birleşik text
  const primaryText = [title, ...requirements].join(' ');
  const primarySkills = findSkillsInText(primaryText);

  // Description'daki tüm skill'ler
  const descriptionSkills = description ? findSkillsInText(description) : new Set<string>();

  // Sonuç listesi — duplicate'leri önlemek için Set kullan
  const results: ExtractedSkill[] = [];
  const addedSkills = new Set<string>();

  // Önce main skill'ler (title + requirements'da geçenler)
  for (const skillName of primarySkills) {
    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry || addedSkills.has(skillName)) continue;

    results.push({
      name: entry.name,
      category: entry.category,
      isMain: true,
    });
    addedSkills.add(skillName);
  }

  // Sonra side skill'ler (sadece description'da geçenler)
  for (const skillName of descriptionSkills) {
    if (addedSkills.has(skillName)) continue;

    const entry = SKILL_DATABASE.find((e) => e.name === skillName);
    if (!entry) continue;

    results.push({
      name: entry.name,
      category: entry.category,
      isMain: false,
    });
    addedSkills.add(skillName);
  }

  return results;
};
