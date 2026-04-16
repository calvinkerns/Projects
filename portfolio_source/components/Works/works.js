import React, { useState, useEffect, useRef } from 'react';
import './works.css';
import verbaslide from '../../assets/verbaslide.png';
import viewer from '../../assets/viewer.png';
import portfolio2 from '../../assets/micro_image.png';

const Works = () => {
  const [currentProject, setCurrentProject] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  const projects = [
    {
      name: 'VerbaSlide:',
      description: 'AI-powered speaker notes generation system using Mastra framework and GPT-4o-mini to automate presentation script creation. Implemented real-time streaming with incremental JSON parsing for live UI updates via Server-Sent Events. Integrated Google Slides API for slide content extraction and designed Firebase database architecture managing user authentication, project storage, and generated speaker notes across collections. Website and Chrome add-on publishing soon.',
      link: null,
      linkText: null,
      image: verbaslide
    },
    {
      name: '3D Gaussian Viewer:',
      description: 'A GPU-accelerated 3D visualization engine using WebGL and Gaussian Splatting to render point-cloud data from PLY files. Designed custom GLSL shaders implementing covariance matrix computations, quaternion-based transformations, and tile-based sorting optimization for real-time performance. Architected modular JavaScript codebase separating rendering logic, camera controls, and file I/O into discrete modules.',
      link: 'https://konnorkooi.com/gaussian-viewer/',
      linkText: 'Link',
      image: viewer
    },
    {
      name: 'Microshell:',
      description: 'A command-line shell interface that processes user input through expansion, parsing, and execution to interact with the operating system. Implements core shell functionality including command execution, program launching, file and directory management, pipeline processing, and I/O redirection for seamless system interaction.',
      link: null,
      linkText: null,
      image: portfolio2
    }
  ];

  const nextProject = () => {
    setCurrentProject((prev) => (prev + 1) % projects.length);
  };

  const prevProject = () => {
    setCurrentProject((prev) => (prev - 1 + projects.length) % projects.length);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.2,
        rootMargin: '0px'
      }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section id="works" ref={sectionRef} className={isVisible ? 'visible' : ''}>
      <div className='header'>
        <span className='top'>Projects <br/> <br/></span>
      </div>
      <div className='projectCarousel'>
        <button className='navButton prev' onClick={prevProject}>‹</button>
        <div className='projectList'>
          <div className='project'>
            {projects[currentProject].image && (
              <div className='projectImageContainer'>
                <img
                  src={projects[currentProject].image}
                  alt={projects[currentProject].name}
                  className='projectImage'
                />
              </div>
            )}
            <div className='projectContent'>
              <span className='projectName'> <u>{projects[currentProject].name}</u><br/></span>
              <span className='projectPara'>{projects[currentProject].description}</span>
              {projects[currentProject].link && (
                <div className='projectHyper'>
                  <span className='link'>
                    <a href={projects[currentProject].link} target="_blank" rel="noopener noreferrer">
                      {projects[currentProject].linkText}
                    </a>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <button className='navButton next' onClick={nextProject}>›</button>
      </div>
      <div className='githubLINK'>
        <span className='GitHub'> All other projects including these and their source code are on my GitHub: </span>
        <div className='githubHyper'>
          <span className='link'> <a href="https://github.com/calvinkerns/Projects.git" target="_blank" rel="noopener noreferrer">GitHub Link</a> </span>
        </div>
      </div>
    </section>
  );
}

export default Works;
