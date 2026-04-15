import ReactSVG from "./assets/react.svg?react";
const Header = () => {
  return (
    <header>
      <nav>
        <ul>
        <li>
        <a href="#">Home</a>
        </li>
        </ul>
      </nav>
    </header>
  )
}
const Main = () => {
  return (
    <main>
     <ReactSVG />
      <h1>Welcome to {import.meta.env.VITE_WEBSITE_NAME} from the App file</h1>
      <section>
        <h2>Section 1</h2>
        <p>This is section 1</p>
        <p>This is some paragraph text about the rapper Nas</p>
        <img src="./assets/nas.jpg" alt="Nas" />  
      </section>
      <br />
      <span></span>
      <ul>        
        <li>Lupe Fiasco</li>
        <li>Kendrick Lamar</li>
        <li>J. Cole</li>
        <li>Drake</li>
        <li>Travis Scott</li>
        <li>Future</li>
        <li>Lil Wayne</li>
        <li>Biggie</li>
        <li>Eminem</li>
        <li>Ice Cube</li>
        <li>50 Cent</li>
        <li>Slick Rick</li>
      </ul>
    </main>
  )
}
const Footer = () => {
  return (
    <footer>
      <p>Copyright {new Date().getFullYear()} {import.meta.env.VITE_SITE_OWNER}</p>
    </footer>
  )
}

const App = () => {
  return (
    <>
      <Header />
      <Main />
      <Footer />
    </>
  )
}
export default App
