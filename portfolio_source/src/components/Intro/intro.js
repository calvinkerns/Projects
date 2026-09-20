import React, { useState, useEffect } from 'react';
import './intro.css';
import { Link } from 'react-scroll';
import useReveal from '../../hooks/useReveal';

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5A11.5 11.5 0 0 0 8.36 22.92c.57.1.78-.25.78-.55 0-.27-.01-1-.02-1.95-3.19.7-3.87-1.53-3.87-1.53-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.09 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.75-1.95C21.4 8.75 22 11 22 14.1V21h-4v-6.1c0-1.45-.03-3.3-2.05-3.3-2.06 0-2.37 1.57-2.37 3.2V21h-4z" />
  </svg>
);

const FINAL_NAME = 'Calvin Kerns';
const FINAL_DESC = "CS Master's 2027 | Software Development Intern @ SPIE";
const CHARS = '01';

const EDUCATION = [
  {
    title: 'MS Computer Science',
    org: 'Western Washington University',
    meta: 'Expected Spring 2027',
    current: true,
  },
  {
    title: 'BS Computer Science, Mathematics Minor',
    org: 'Western Washington University',
    meta: 'Graduated Spring 2026',
  },
];

const EXPERIENCE = [
  {
    title: 'Software Development Intern',
    org: 'SPIE',
    meta: 'June 2026 — Present',
    current: true,
  },
  {
    title: 'Math & Computer Science Tutor',
    org: 'Seattle Colleges',
    meta: 'January 2023 — Present',
    current: true,
  },
  {
    title: 'Full Stack Developer',
    org: 'Dementia Support Northwest',
    meta: 'June 2025 — June 2026',
  },
];

const Timeline = ({ title, items }) => (
  <div className="timelineCol">
    <h3 className="timelineTitle">{title}</h3>
    <ul className="timeline">
      {items.map((item) => (
        <li key={`${item.title}-${item.org}`} className={`timelineItem ${item.current ? 'isCurrent' : ''}`}>
          <span className="timelineRole">{item.title}</span>
          <span className="timelineOrg">{item.org}</span>
          <span className="timelineMeta">{item.meta}</span>
        </li>
      ))}
    </ul>
  </div>
);

const Intro = () => {
  const [nameText, setNameText] = useState('');
  const [descText, setDescText] = useState('');
  const [bioRef, bioClass] = useReveal();
  const [bgRef, bgClass] = useReveal();

  useEffect(() => {
    const TICK_MS = 28;
    const SETTLE_MS = 1000;

    // Spaces are left intact so the string wraps the same way mid-scramble
    // as it does once decoded — otherwise it becomes one unbreakable token.
    const scramble = (target, settled) =>
      target
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' ';
          if (index < settled) return target[index];
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join('');

    // The step scales with the string's length, so every line settles in
    // SETTLE_MS regardless of how long it is — the tagline is four times
    // the name and used to take four times as long to decode.
    const run = (target, setText) => {
      const step = target.length / (SETTLE_MS / TICK_MS);
      let settled = 0;

      const id = setInterval(() => {
        setText(scramble(target, settled));
        settled += step;

        if (settled >= target.length) {
          clearInterval(id);
          setText(target);
        }
      }, TICK_MS);

      return id;
    };

    const nameInterval = run(FINAL_NAME, setNameText);
    const descInterval = run(FINAL_DESC, setDescText);

    return () => {
      clearInterval(nameInterval);
      clearInterval(descInterval);
    };
  }, []);

  return (
    <section id="intro" className="section heroSection">
      <div className="container">
        <div className="hero">
          <p className="heroEyebrow">Bellingham, Washington</p>

          {/* aria-label carries the real name — the scramble is decorative */}
          <h1 className="heroName" aria-label={FINAL_NAME}>
            <span aria-hidden="true">{nameText}</span>
          </h1>

          <p className="heroTagline" aria-label={FINAL_DESC}>
            <span aria-hidden="true">{descText}</span>
          </p>

          <div ref={bioRef} className={`heroBio ${bioClass}`}>
            <p>
              <strong>Computer Science master's student</strong> with a <strong>Mathematics minor</strong> at
              Western Washington University, maintaining a <strong>3.8 GPA</strong>. I'm currently a{' '}
              <strong>software development intern at SPIE</strong>, working on a large production web
              application, and I tutor CS and mathematics at Seattle Colleges. Before that I spent a year as a
              full stack developer for Dementia Support Northwest.
            </p>
            <p>
              I am passionate about creating meaningful impact through technology and tackling complex problems
              to better myself and the projects I work on. Outside academics and work, I'm an avid sports
              enthusiast—you'll find me on the soccer pitch, on the volleyball court, or at the driving range as
              much as possible.
            </p>

            <div className="heroActions">
              <Link to="works" smooth offset={-90} duration={500} className="btn btnPrimary">
                View projects
              </Link>
              <Link to="contactPage" smooth offset={-70} duration={500} className="btn btnGhost">
                Get in touch
              </Link>

              <div className="heroSocial">
                <a href="https://github.com/calvinkerns" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                  <GitHubIcon />
                </a>
                <a href="https://www.linkedin.com/in/kernsc" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <LinkedInIcon />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div ref={bgRef} className={`backgroundGrid ${bgClass}`}>
          <Timeline title="Education" items={EDUCATION} />
          <Timeline title="Experience" items={EXPERIENCE} />
        </div>
      </div>
    </section>
  );
};

export default Intro;
