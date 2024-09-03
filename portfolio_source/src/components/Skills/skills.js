import React from 'react';
import './skills.css';
import pythonIMG from '../../assets/pythonIMG.png';
import javaIMG from '../../assets/javaIMG.png';
import javascriptIMG from '../../assets/javascriptIMG.png';
import cIMG from '../../assets/cIMG.png';
import racketIMG from '../../assets/racketIMG.png';
import reactIMG from '../../assets/React.png';
import HTML_IMG from '../../assets/HTML.png';

const Skills = () => {
  return (
    <section id='skills'>
      <span className='Header'><hr/><br/>About Me <br /><br /></span>
      <span className='Paragraph1'>
        I am an adaptive problem solver and a tenacious worker. Throughout my life, I've competed at the highest levels of soccer, leading my team as captain to multiple regional championships. These experiences have honed my ability to thrive in high-stress environments and adapt to any challenges that come my way. <br/>
      </span>
      <span className='Paragraph3'>
        Working alongside teammates and colleagues is both fulfilling and motivating for me, and I naturally establish myself as a leader among my peers. My studies in computer science have allowed me to fully apply these skills while exposing me to the incredible world of technology and the endless learning opportunities it offers, which I find continuously intriguing.<br/>
      </span>
      <span className='mySkills'> <br />Skills<br /><br /></span>
      <div className='skillsList'>
        <div className='language'>
          <div className='languagePic'>
            <img src={javascriptIMG} alt="JavaScript" className='languageIMG'/>
          </div>
          <span className='languageText'>JavaScript</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={javaIMG} alt="Java" className='languageIMG'/>
          </div>
          <span className='languageText'>Java</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={cIMG} alt="C" className='languageIMG'/>
          </div>
          <span className='languageText'>C</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={pythonIMG} alt="Python" className='languageIMG'/>
          </div>
          <span className='languageText'>Python</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={reactIMG} alt="React JS" className='languageIMG'/>
          </div>
          <span className='languageText'>React JS</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={HTML_IMG} alt="HTML" className='languageIMG'/>
          </div>
          <span className='languageText'>HTML</span>
        </div>
        <div className='language'>
          <div className='languagePic'>
            <img src={racketIMG} alt="Racket" className='languageIMG'/>
          </div>
          <span className='languageText'>Racket</span>
        </div>
      </div>
    </section>
  );
}

export default Skills;