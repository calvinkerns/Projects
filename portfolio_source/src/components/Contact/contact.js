import React, { useState, useEffect, useRef } from 'react';
import './contact.css';

const Contact = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

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
    <>
      <section id="contactPage" ref={sectionRef} className={isVisible ? 'visible' : ''}>
        <div id="contact">
          <h1 className="contactPageTitle">Contact Me</h1>
          <span className="contactDesc">
            Feel free to reach out to discuss any work opportunities or just to get in touch.
          </span>
          <div className="contactInfo">
            <div className="contactItem">
              <div className="contactLabel">Email</div>
              <a href="calvinkerns009@gmail.com" className="contactValue">
                calvinkerns009@gmail.com
              </a>
            </div>
            <div className="contactItem">
              <div className="contactLabel">Phone</div>
              <a href="tel:+2065141454" className="contactValue">
                (206) 514-1454
              </a>
            </div>
            <div className="contactItem">
              <div className="contactLabel">LinkedIn</div>
              <a href="https://www.linkedin.com/in/kernsc" target="_blank" rel="noopener noreferrer" className="contactValue">
                www.linkedin.com/in/kernsc
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default Contact;