import React from 'react';
import './skills.css';
import useReveal from '../../hooks/useReveal';
import { IMAGE_ICONS, SVG_ICONS } from '../../icons';
import { SKILL_GROUPS, LEVELS } from '../../data/portfolio';

const SkillMark = ({ name }) => {
  const img = IMAGE_ICONS[name];
  const Svg = SVG_ICONS[name];

  if (img) return <span className="skillMark"><img src={img} alt="" /></span>;
  if (Svg) return <span className="skillMark"><Svg /></span>;

  // Skills with no brand asset get a monogram so the column stays even.
  return <span className="skillMark isMono">{name.slice(0, 2)}</span>;
};

const Meter = ({ level }) => (
  <span className="meter" aria-hidden="true">
    {[1, 2, 3, 4].map((step) => (
      <span key={step} className={`meterTick ${step <= level ? 'isOn' : ''}`} />
    ))}
  </span>
);

const SkillRow = ({ skill }) => (
  <li className="skillRow">
    <div className="skillRowInner">
      <SkillMark name={skill.name} />
      <span className="skillName">{skill.name}</span>
      <span className="skillLeader" aria-hidden="true" />
      <Meter level={skill.level} />
      <span className="skillLevel">{LEVELS[skill.level].label}</span>
    </div>
  </li>
);

const Skills = () => {
  const [ref, revealClass] = useReveal();

  return (
    <section id="proficiency" className="section">
      <div className="container">
        <div className="sectionHead">
          <p className="eyebrow">Toolkit</p>
          <h2 className="sectionTitle">Skills</h2>
          <p className="sectionSub">
            What I reach for day to day, across coursework, my internship, and personal projects.
          </p>
        </div>

        <div className="legend">
          {[4, 3, 2, 1].map((level) => (
            <span key={level} className="legendItem">
              <Meter level={level} />
              {LEVELS[level].label}
            </span>
          ))}
        </div>

        <div ref={ref} className={`skillsGrid ${revealClass}`}>
          {SKILL_GROUPS.map((group) => (
            <section key={group.id} className="skillsGroup">
              <h3 className="skillsGroupTitle">
                {group.title}
                <span className="skillsGroupCount">{group.skills.length}</span>
              </h3>

              <ul className="skillsList">
                {group.skills.map((skill) => (
                  <SkillRow key={skill.name} skill={skill} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Skills;
