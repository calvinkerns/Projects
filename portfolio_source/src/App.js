import Navbar from "./components/NavBar/navbar";
import Intro from "./components/Intro/intro";
import Skills from "./components/Skills/skills";
import Works from "./components/Works/works";
import Contact from "./components/Contact/contact";
import SectionDivider from "./components/SectionDivider/SectionDivider";

function App() {
  return (
    <div className="App">
      <Navbar/>
      <Intro/>
      <SectionDivider/>
      <Skills/>
      <SectionDivider/>
      <Works/>
      <SectionDivider/>
      <Contact/>
    </div>
  );
}

export default App;
