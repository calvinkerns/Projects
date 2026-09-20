import React, { useEffect, useState } from 'react';
import './navbar.css';
import logo from '../../assets/logo.png';
import { Link } from 'react-scroll';

const NAV_LINKS = [
  { to: 'intro', label: 'About' },
  { to: 'proficiency', label: 'Skills' },
  { to: 'works', label: 'Projects' },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Don't leave the mobile sheet open behind a resize into the desktop layout
  useEffect(() => {
    const onResize = () => window.innerWidth > 720 && setMenuOpen(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const close = () => setMenuOpen(false);

  return (
    <header className={`navbar ${scrolled ? 'isScrolled' : ''}`}>
      <div className="navInner">
        <Link to="intro" smooth duration={500} className="brand" onClick={close}>
          <img src={logo} alt="" className="brandMark" />
          <span className="brandName">Calvin Kerns</span>
        </Link>

        <nav className={`navLinks ${menuOpen ? 'isOpen' : ''}`}>
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              spy
              smooth
              offset={-90}
              duration={500}
              activeClass="isActive"
              className="navLink"
              onClick={close}
            >
              {label}
            </Link>
          ))}
          <Link
            to="contactPage"
            smooth
            offset={-70}
            duration={500}
            className="btn btnPrimary navCta"
            onClick={close}
          >
            Contact
          </Link>
        </nav>

        <button
          className={`navToggle ${menuOpen ? 'isOpen' : ''}`}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
};

export default Navbar;
