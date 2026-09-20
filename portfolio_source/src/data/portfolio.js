import verbaslide from '../assets/verbaslide.png';
import verbaslideDemo from '../assets/Verbaslide_Demo.mp4';
import viewer from '../assets/viewer.png';
import botarena from '../assets/botarena.png';
import microshell from '../assets/micro_image.png';

/* Proficiency is expressed as four named bands rather than a percentage.
   "80% at Java" invites an argument; "use it daily" doesn't. */
export const LEVELS = {
  4: { label: 'Go-to' },
  3: { label: 'Proficient' },
  2: { label: 'Working' },
  1: { label: 'Familiar' },
};

export const SKILL_GROUPS = [
  {
    id: 'lang',
    title: 'Languages',
    skills: [
      { name: 'Python',     level: 4 },
      { name: 'Java',       level: 3 },
      { name: 'JavaScript', level: 4 },
      { name: 'TypeScript', level: 4 },
      { name: 'C',          level: 3 },
      { name: 'C#',         level: 2 },
      { name: 'SQL',        level: 2 },
    ],
  },
  {
    id: 'frame',
    title: 'Frameworks & Libraries',
    skills: [
      { name: 'React',       level: 4 },
      { name: 'ASP.NET MVC', level: 4 },
      { name: 'Node.js',     level: 3 },
      { name: 'NumPy',       level: 3 },
      { name: 'PyTorch',     level: 2 },
      { name: 'Django',      level: 1 },
    ],
  },
  {
    id: 'tools',
    title: 'Tools & Platforms',
    skills: [
      { name: 'Git',    level: 4 },
      { name: 'Linux',  level: 3 },
      { name: 'Docker', level: 2 },
      { name: 'AWS',    level: 1 },
    ],
  },
];

/* `stack` holds the skills from the index above; `tags` are the extra
   project-specific technologies. Both render as chips, stack first. */
export const PROJECTS = [
  {
    name: 'VerbaSlide',
    description:
      'AI-powered speaker notes generation system using Mastra framework and GPT-4o-mini to automate presentation script creation. Implemented real-time streaming with incremental JSON parsing for live UI updates via Server-Sent Events. Integrated Google Slides API for slide content extraction and designed Firebase database architecture managing user authentication, project storage, and generated speaker notes across collections. Website and Chrome add-on publishing soon.',
    stack: ['TypeScript', 'React', 'Node.js'],
    tags: ['Mastra', 'GPT-4o-mini', 'Firebase', 'Server-Sent Events', 'Google Slides API'],
    image: verbaslide,
    video: verbaslideDemo,
    link: null,
    linkText: null,
  },
  {
    name: '3D Gaussian Viewer',
    description:
      'A GPU-accelerated 3D visualization engine using WebGL and Gaussian Splatting to render point-cloud data from PLY files. Designed custom GLSL shaders implementing covariance matrix computations, quaternion-based transformations, and tile-based sorting optimization for real-time performance. Architected modular JavaScript codebase separating rendering logic, camera controls, and file I/O into discrete modules.',
    stack: ['JavaScript'],
    tags: ['WebGL', 'GLSL', 'Gaussian Splatting'],
    image: viewer,
    link: 'https://calvinkerns.github.io/Projects/gaussian-viewer/',
    linkText: 'View site',
  },
  {
    name: 'Surge: Bot Arena',
    description:
      'Browser-based bot programming game executing untrusted player JavaScript inside a tick-based grid combat simulation. Implemented a Web Worker sandbox with no network access and a per-tick time budget that forfeits on overrun, piping worker output to an in-page console. Designed a deterministic simulation core around a seeded map generator and fixed tick loop so matches replay exactly from a shared URL, with a scrubbable replay viewer and a bot API exposing tile queries and wall-aware pathfinding.',
    stack: ['JavaScript'],
    tags: ['Web Workers', 'Sandboxing', 'Game Simulation', 'Replay System'],
    image: botarena,
    link: 'https://calvinkerns.github.io/Projects/bot-arena/site/',
    linkText: 'View site',
  },
  {
    name: 'Microshell',
    description:
      'A command-line shell interface that processes user input through expansion, parsing, and execution to interact with the operating system. Implements core shell functionality including command execution, program launching, file and directory management, pipeline processing, and I/O redirection for seamless system interaction.',
    stack: ['C', 'Linux', 'Git'],
    tags: ['Unix', 'Systems Programming'],
    image: microshell,
    link: null,
    linkText: null,
  },
];
