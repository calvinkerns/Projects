import React from 'react';
import './intro.css';
import bg from '../../assets/image.png';
import {Link} from 'react-scroll';

const Intro = () => {
  return (
    <section id="intro">
        <div className="introContent">
            <span className="hello">Hey,</span>
            <span className="introName1">I'm <span className="introName2">Calvin <br /> </span> </span>
            <span className="introText">Computer Science student at Western Washington University, pursuing a master's degree. </span>
            <span className="introPara"><i>This site is designed to showcase some of my projects and provide information about myself. </i></span>
        </div>
        <img src={bg} alt="Profile" className="bg" />
    </section>
  )
}

export default Intro;