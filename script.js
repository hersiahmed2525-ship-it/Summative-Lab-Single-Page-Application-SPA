// dictionary api url
const API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";

// storage key for saved words and theme
const STORAGE_KEY = "wordly-favorites";
const THEME_KEY = "wordly-theme";

// grab the elements
const form = document.getElementById("search-form");
const input = document.getElementById("word-input");
const results = document.getElementById("results");
const errorBox = document.getElementById("error-message");
const favoritesList = document.getElementById("favorites-list");
const themeToggle = document.getElementById("theme-toggle");

// load saved words from storage, or start with an empty list
let favorites = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

// show an error message on screen
function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

// hide the error message
function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

// use the browser's built-in voice to say a word
function speakWord(word) {
  if (!window.speechSynthesis) {
    showError("Audio not supported in this browser.");
    return;
  }
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(word);
  speech.lang = "en-US";
  window.speechSynthesis.speak(speech);
}

// fetch word data from the api
async function fetchWord(word) {
  const url = API_URL + encodeURIComponent(word);

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error("Could not connect. Check your internet.");
  }

  if (response.status === 404) {
    throw new Error(
      'No definition found for "' + word + '". Check the spelling.'
    );
  }

  // server-side errors - api is down or overloaded
  if (response.status >= 500) {
    throw new Error(
      "The dictionary service is unavailable right now (error " +
        response.status +
        "). Please try again in a few minutes."
    );
  }

  if (!response.ok) {
    throw new Error("Request failed with status " + response.status);
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No usable data returned for that word.");
  }

  return data;
}

// build the word card
function renderWord(data) {
  results.innerHTML = "";
  const entry = data[0];

  const card = document.createElement("div");
  card.className = "word-card";

  // header with word, phonetic, and buttons
  const header = document.createElement("div");
  header.className = "word-header";

  const title = document.createElement("h2");
  title.textContent = entry.word;
  header.appendChild(title);

  // phonetic - try top level first, then look inside phonetics array
  let phoneticText = entry.phonetic;
  if (!phoneticText && entry.phonetics) {
    for (let i = 0; i < entry.phonetics.length; i++) {
      if (entry.phonetics[i].text) {
        phoneticText = entry.phonetics[i].text;
        break;
      }
    }
  }
  const phonetic = document.createElement("span");
  phonetic.className = "phonetic";
  if (phoneticText) {
    phonetic.textContent = phoneticText;
  }
  else {
    phonetic.textContent = "Pronunciation unavailable";
  }
  header.appendChild(phonetic);

  // play audio button
  const audioBtn = document.createElement("button");
  audioBtn.type = "button";
  audioBtn.className = "audio-btn";
  audioBtn.textContent = "Play Audio";
  audioBtn.addEventListener("click", function () {
    speakWord(entry.word);
  });
  header.appendChild(audioBtn);

  // save button
  const isSaved = favorites.indexOf(entry.word) !== -1;
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "save-btn";
  if (isSaved) {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "Saved";
  }
  else {
    saveBtn.textContent = "Save";
  }

  saveBtn.addEventListener("click", function () {
    toggleFavorite(entry.word);
    if (favorites.indexOf(entry.word) !== -1) {
      saveBtn.classList.add("saved");
      saveBtn.textContent = "Saved";
    }
    else {
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "Save";
    }
  });
  header.appendChild(saveBtn);

  card.appendChild(header);

  // meanings - one block per part of speech
  const meanings = entry.meanings || [];
  for (let m = 0; m < meanings.length; m++) {
    const meaning = meanings[m];

    const block = document.createElement("div");
    block.className = "meaning";

    const pos = document.createElement("h3");
    pos.textContent = meaning.partOfSpeech || "Definition";
    block.appendChild(pos);

    // definitions
    const defs = meaning.definitions || [];
    for (let d = 0; d < defs.length; d++) {
      const def = defs[d];

      const p = document.createElement("p");
      p.className = "definition";
      p.textContent = def.definition;
      block.appendChild(p);

      if (def.example) {
        const ex = document.createElement("p");
        ex.className = "example";
        ex.textContent = '"' + def.example + '"';
        block.appendChild(ex);
      }
    }

    // synonyms with fallback
    const synonyms = meaning.synonyms || [];
    const syn = document.createElement("p");
    syn.className = "synonyms";
    if (synonyms.length > 0) {
      syn.textContent = "Synonyms: " + synonyms.join(", ");
    }
    else {
      syn.textContent = "No synonyms available.";
    }
    block.appendChild(syn);

    // antonyms with fallback
    const antonyms = meaning.antonyms || [];
    const ant = document.createElement("p");
    ant.className = "antonyms";
    if (antonyms.length > 0) {
      ant.textContent = "Antonyms: " + antonyms.join(", ");
    }
    else {
      ant.textContent = "No antonyms available.";
    }
    block.appendChild(ant);

    card.appendChild(block);
  }

  results.appendChild(card);
}

// add or remove a word from saved list
function toggleFavorite(word) {
  const index = favorites.indexOf(word);

  if (index !== -1) {
    favorites.splice(index, 1);
  }
  else {
    favorites.push(word);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  renderFavorites();
}

// redraw the saved words list
function renderFavorites() {
  favoritesList.innerHTML = "";

  if (favorites.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No saved words yet";
    empty.className = "empty-favorites";
    favoritesList.appendChild(empty);
    return;
  }

  for (let i = 0; i < favorites.length; i++) {
    const word = favorites[i];

    const li = document.createElement("li");

    // button gets the styled class
    const button = document.createElement("button");
    button.type = "button";
    button.className = "favorite-word";
    button.textContent = word;
    button.addEventListener("click", function () {
      input.value = word;
      handleSearch(word);
    });

    li.appendChild(button);
    favoritesList.appendChild(li);
  }
}

// main search handler
async function handleSearch(word) {
  clearError();
  results.innerHTML = "";

  if (!word || word.trim() === "") {
    showError("Please enter a word to search.");
    input.focus();
    return;
  }

  try {
    const data = await fetchWord(word.trim());
    renderWord(data);
  } catch (err) {
    showError(err.message);
  }
}

// form submit
form.addEventListener("submit", function (e) {
  e.preventDefault();
  handleSearch(input.value);
});

// dark mode toggle
themeToggle.addEventListener("click", function () {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

// restore saved theme on page load
if (localStorage.getItem(THEME_KEY) === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "Light Mode";
}

// start
renderFavorites();
