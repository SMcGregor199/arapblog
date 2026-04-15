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