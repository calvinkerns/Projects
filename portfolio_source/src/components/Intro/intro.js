import React, { useState, useEffect, useRef } from 'react';
import './intro.css';
import {Link} from 'react-scroll';

const Intro = () => {
  const [nameText, setNameText] = useState('');
  const [descText, setDescText] = useState('');
  const [isParagraphVisible, setIsParagraphVisible] = useState(false);
  const paragraphRef = useRef(null);

  const finalName = 'Calvin Kerns';
  const finalDesc = "CS Master's 2027 | Software Development Intern @ SPIE";

  const chars = '01';

  useEffect(() => {
    let nameIterations = 0;
    let descIterations = 0;
    const maxIterations = 20;

    const nameInterval = setInterval(() => {
      setNameText(prevText => {
        return finalName.split('').map((char, index) => {
          if (char === ' ') {
            return ' ';
          }
          if (index < nameIterations) {
            return finalName[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');
      });

      nameIterations += 1/3;

      if (nameIterations >= finalName.length) {
        clearInterval(nameInterval);
        setNameText(finalName);
      }
    }, 28);

    const descInterval = setInterval(() => {
      setDescText(prevText => {
        return finalDesc.split('').map((char, index) => {
          if (char === ' ') {
            return ' ';
          }
          if (index < descIterations) {
            return finalDesc[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');
      });

      descIterations += 1/2;

      if (descIterations >= finalDesc.length) {
        clearInterval(descInterval);
        setDescText(finalDesc);
      }
    }, 25);

    return () => {
      clearInterval(nameInterval);
      clearInterval(descInterval);
    };
  }, []);

  useEffect(() => {
    const currentRef = paragraphRef.current;
    let hasScrolled = false;

    const handleScroll = () => {
      hasScrolled = true;
    };

    window.addEventListener('scroll', handleScroll, { once: true });

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasScrolled) {
          setIsParagraphVisible(true);
        }
      },
      {
        threshold: 0.3,
        rootMargin: '-100px'
      }
    );

    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <section id="intro">
      <div className="introMainLayout">
        <div className="introContent">
          <span className="introName2 decode-text">
            {nameText}
          </span>
          <span className="introText decode-text">
            {descText}
          </span>
        </div>
        <div className="introBoxes">
          <div className="introBox educationBox">
            <h2>Education</h2>
            <ul>
              <li>BS Computer Science, Mathematics Minor — Western Washington University<br/>Graduated Spring 2026</li>
              <li>MS Computer Science — Western Washington University<br/>Expected Spring 2027</li>
            </ul>
          </div>
          <div className="introBox experienceBox">
            <h2>Experience</h2>
            <ul>
              <li>Software Development Intern @ SPIE<br/>June 2026 - Present</li>
              <li>Full Stack Developer @ Dementia Support Northwest<br/>June 2025 - June 2026</li>
              <li>Math and Computer Science Tutor @ Seattle Colleges<br/>January 2023 - Present</li>
            </ul>
          </div>
        </div>
        <div className="aboutParagraph" ref={paragraphRef}>
          <p>
            <strong>Computer Science master's student</strong> with a <strong>Mathematics minor</strong> at Western Washington University, maintaining a <strong>3.8 GPA</strong>. I'm currently a <strong>software development intern at SPIE</strong>, working on a large production web application, and I tutor CS and mathematics at Seattle Colleges. Before that I spent a year as a full stack developer for Dementia Support Northwest. I am passionate about creating meaningful impact through technology and tackling complex problems to better myself and the projects I work on.
          </p>
          <p>
            Outside academics and work, I'm an avid sports enthusiast—you'll find me on the soccer pitch, on the volleyball court, or at the driving range as much as possible.
          </p>
        </div>
      </div>
    </section>
  )
}

export default Intro;