import Navbar from './components/NavBar/navbar';
import Intro from './components/Intro/intro';
import Skills from './components/Skills/skills';
import Works from './components/Works/works';
import Contact from './components/Contact/contact';

function App() {
  return (
    <div className="App">
      <Navbar />
      <main>
        <Intro />
        <Skills />
        <Works />
        <Contact />
      </main>
      <footer className="siteFooter">
        <span>© {new Date().getFullYear()} Calvin Kerns</span>
        <span>Bellingham, WA</span>
      </footer>
    </div>
  );
}

export default App;
