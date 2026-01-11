document.addEventListener("DOMContentLoaded", function() {
  const burger = document.getElementById("burger-menu");
  const nav = document.getElementById("main-nav");
  burger.addEventListener("click", function() {
    nav.classList.toggle("open");
  });
});