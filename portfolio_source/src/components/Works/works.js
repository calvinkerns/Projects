import React, { useState } from 'react';
import './works.css';
import useReveal from '../../hooks/useReveal';
import { PROJECTS } from '../../data/portfolio';

const ProjectRow = ({ project, index }) => {
  const [ref, revealClass] = useReveal();
  const [isPlaying, setIsPlaying] = useState(false);
  const chips = [...project.stack, ...project.tags];

  return (
    <article
      ref={ref}
      className={`project ${index % 2 === 1 ? 'isFlipped' : ''} ${revealClass}`}
    >
      <div className="projectMediaCol">
        <div className="projectMedia">
          {project.video && isPlaying ? (
            <video
              src={project.video}
              poster={project.image}
              controls
              autoPlay
              playsInline
            />
          ) : (
            <>
              <img src={project.image} alt={`${project.name} screenshot`} loading="lazy" />
              {project.video && (
                <button
                  className="playButton"
                  onClick={() => setIsPlaying(true)}
                  aria-label={`Play ${project.name} demo video`}
                >
                  ▶
                </button>
              )}
            </>
          )}
        </div>
        {project.video && <span className="mediaCaption">Demo Video</span>}
      </div>

      <div className="projectBody">
        <p className="projectIndex">{String(index + 1).padStart(2, '0')}</p>

        <h3 className="projectName">{project.name}</h3>

        <p className="projectDesc">{project.description}</p>

        <ul className="projectTags">
          {chips.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>

        {project.link && (
          <a
            className="projectLink"
            href={project.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {project.linkText}
            <span aria-hidden="true">→</span>
          </a>
        )}

        {!project.link && project.note && (
          <p className="projectNote">{project.note}</p>
        )}
      </div>
    </article>
  );
};

const Works = () => {
  const [ctaRef, ctaClass] = useReveal();

  return (
    <section id="works" className="section">
      <div className="container">
        <div className="sectionHead">
          <p className="eyebrow">Selected work</p>
          <h2 className="sectionTitle">Projects</h2>
          <p className="sectionSub">
            A few things I've built recently, from AI tooling to GPU rendering to systems programming.
          </p>
        </div>

        <div className="projectList">
          {PROJECTS.map((project, index) => (
            <ProjectRow key={project.name} project={project} index={index} />
          ))}
        </div>

        <div ref={ctaRef} className={`worksCta card ${ctaClass}`}>
          <p>Source code for my projects is available on my GitHub.</p>
          <a
            className="btn btnGhost"
            href="https://github.com/calvinkerns/Projects.git"
            target="_blank"
            rel="noopener noreferrer"
          >
            Browse the repository
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
};

export default Works;
