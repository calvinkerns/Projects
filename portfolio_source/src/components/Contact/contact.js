import React from 'react';
import './contact.css';
import useReveal from '../../hooks/useReveal';

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
    <path d="m3 7 8.4 5.6a1.8 1.8 0 0 0 2 0L22 7" />
  </svg>
);

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.3 3.5h2.9l1.5 3.7-2 1.3a12.5 12.5 0 0 0 6.8 6.8l1.3-2 3.7 1.5v2.9a2 2 0 0 1-2.2 2A17.5 17.5 0 0 1 4.3 5.7a2 2 0 0 1 2-2.2Z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.75-1.95C21.4 8.75 22 11 22 14.1V21h-4v-6.1c0-1.45-.03-3.3-2.05-3.3-2.06 0-2.37 1.57-2.37 3.2V21h-4z" />
  </svg>
);

const CHANNELS = [
  {
    label: 'Email',
    value: 'calvinkerns009@gmail.com',
    href: 'mailto:calvinkerns009@gmail.com',
    Icon: MailIcon,
    external: false,
  },
  {
    label: 'Phone',
    value: '(206) 514-1454',
    href: 'tel:+12065141454',
    Icon: PhoneIcon,
    external: false,
  },
  {
    label: 'LinkedIn',
    value: 'linkedin.com/in/kernsc',
    href: 'https://www.linkedin.com/in/kernsc',
    Icon: LinkedInIcon,
    external: true,
  },
];

const Contact = () => {
  const [ref, revealClass] = useReveal();

  return (
    <section id="contactPage" className="section">
      <div className="container">
        <div className="sectionHead contactHead">
          <p className="eyebrow">Contact</p>
          <h2 className="sectionTitle">Let's build something.</h2>
          <p className="sectionSub">
            Feel free to reach out to discuss work opportunities, or just to get in touch.
          </p>
        </div>

        <div id="contact" ref={ref} className={`contactGrid ${revealClass}`}>
          {CHANNELS.map(({ label, value, href, Icon, external }) => (
            <a
              key={label}
              className="contactCard card"
              href={href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className="contactIcon"><Icon /></span>
              <span className="contactLabel">{label}</span>
              <span className="contactValue">{value}</span>
              <span className="contactArrow" aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Contact;
