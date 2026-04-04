import './style.css'
import javascriptLogo from './assets/javascript.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import { setupCounter } from './counter.js'
//import "./auth-state";

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("Login").addEventListener("click", () => {
    window.location.href = "/login.html";
  });
});