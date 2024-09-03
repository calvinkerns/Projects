import React from 'react';
import './works.css';

const Works = () => {
  return (
    <section id="works">
        <div className='header'>
          <span className='top'>Projects <br/> <br/></span>
        </div>
        <div className='projectList'>
          <div className='project'>
            <span className='projectName'> <u>Microshell: </u><br/></span>
            <span className='projectPara'>This shell is a command-line
              interface that provides users with the ability to interact with the operating system and execute
              commands. It acts as an ordinary shell by getting input from user then, expanding, parsing, and
              executing. Able to execute commands, run programs, manage files and directories, pipe, and
              redirect outputs, etc.
            </span>
          </div>
          <div className='project'>
            <span className='projectName'> <u>Racket Interpreter: </u><br/></span>
            <span className='projectPara'>This is an interpreter I built for the functional programming language Racket. It handles
              key aspects of the Racket language, including basic arithmetic, conditionals, and function application. It also
              tracks the current scope allowing for nested function applications. Able to use custom environment for
              symbol lookup passed in as an argument when ran or my preset environment.
            </span>
          </div>
        </div>
        <div className='githubLINK'>
          <span className='GitHub'> All projects and source code are on my GitHub: </span>
          <div className='githubHyper'>
            <span className='link'> <a href="https://github.com/calvinkerns/Projects.git" target="_blank" rel="noopener noreferrer">https://github.com/calvinkerns/Projects.git</a> </span>
          </div>
        </div>
    </section>
  );
}

export default Works;