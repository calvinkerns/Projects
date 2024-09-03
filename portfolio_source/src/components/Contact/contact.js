import React, {useRef} from 'react';
import './contact.css';
import InstagramIMG from "../../assets/instagram.png";
import LinkedInIMG from "../../assets/linkedin.png";
import emailjs from '@emailjs/browser';

const Contact = () => {
  const form = useRef();
  const sendEmail = (e) => {
    e.preventDefault();

    emailjs
      .sendForm('service_bhjqr1r', 'template_tsax3ms', form.current, {
        publicKey: 'o219sUJAsR-hOm8mS',
      })
      .then(
        () => {
          console.log('SUCCESS!');
          alert('Email Sent!')
          e.target.reset();
        },
        (error) => {
          console.log('FAILED...', error.text);
        },
      );
  };
  return (
    <section id="contactPage">
      <div id="contact">
        <h1 className="contactPageTitle">Contact Me</h1>
        <span className="contactDesc">
          Please fill out the form below to discuss any work opportunities or just to get in touch.
        </span>
        <form className="contactForm" ref={form} onSubmit={sendEmail}>
          <input type="text" className="name" placeholder='Your name' name='from_name' />
          <input type="email" className="email" placeholder='Your email' name='your_email'/>
          <textarea className="msg" name="message" rows="5" placeholder="Your message"></textarea>
          <button type="submit" value='Send' className="submitBtn">Submit</button>
          <div className='links'>
            <img src={InstagramIMG} alt="Instagram" className="link" />
            <img src={LinkedInIMG} alt="LinkedIn" className="link" />
          </div>
        </form>
      </div>
    </section>
  );
}

export default Contact;