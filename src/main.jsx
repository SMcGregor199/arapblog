import {createRoot} from "react-dom/client";
const root = createRoot(document.querySelector("#root"));
const Main = () => {
  return (
    <main>
      <h1>Hello Rap World</h1>
    </main>
  )
}
root.render(
  <Main />
)