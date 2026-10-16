const API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const FAVORITES_KEY = "wordly-favorites";
const CACHE_KEY_PREFIX = "wordly-definition:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 8000;
const AUDIO_START_TIMEOUT_MS = 1500;

const form = document.getElementById("search-form");
const input = document.getElementById("word-input");
const searchButton = document.getElementById("search-button");
const results = document.getElementById("results");
const statusMessage = document.getElementById("search-status");
const errorBox = document.getElementById("error-message");
const favoritesList = document.getElementById("favorites-list");
const themeToggle = document.getElementById("theme-toggle");

let favorites = [];
let activeRequest;

const showError = (message, retryWord) => {
  errorBox.replaceChildren();
  errorBox.appendChild(document.createTextNode(message));
  if (retryWord) {
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "retry-button";
    retryButton.textContent = "Retry search";
    retryButton.setAttribute("aria-label", `Retry search for ${retryWord}`);
    retryButton.addEventListener("click", () => handleSearch(retryWord));
    errorBox.appendChild(retryButton);
  }
  errorBox.classList.remove("hidden");
};

const clearError = () => {
  errorBox.replaceChildren();
  errorBox.classList.add("hidden");
};

const setLoading = (isLoading, message) => {
  searchButton.disabled = isLoading;
  form.setAttribute("aria-busy", String(isLoading));
  results.setAttribute("aria-busy", String(isLoading));
  if (message) statusMessage.textContent = message;
};

const loadFavorites = () => {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    if (
      !Array.isArray(parsed) ||
      parsed.some((word) => typeof word !== "string")
    ) {
      throw new Error("Saved words have an invalid format.");
    }
    favorites = [...new Set(parsed.map((word) => word.toLowerCase()))];
  } catch (error) {
    showError(
      error instanceof SyntaxError
        ? "Saved words could not be read. Clear this site's saved data and try again."
        : "Saved words are unavailable in this browser."
    );
  }
};

const fetchWord = async (word, signal) => {
  let response;
  try {
    response = await fetch(`${API_URL}${encodeURIComponent(word)}`, { signal });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Could not connect to the dictionary. Check your internet connection."
    );
  }

  if (response.status === 404) {
    throw new Error(
      `No definition found for "${word}". Check the spelling and try again.`
    );
  }
  if (!response.ok) {
    throw new Error(
      `The dictionary request failed (error ${response.status}). Please try again.`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The dictionary returned an unreadable response. Please try again."
    );
  }
  if (!Array.isArray(data) || !data.length || !data[0]?.word) {
    throw new Error(
      "The dictionary returned no usable information for that word."
    );
  }
  return data;
};

const getCachedWord = (word) => {
  const key = `${CACHE_KEY_PREFIX}${word.toLowerCase()}`;
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return undefined;

    const { data, cachedAt } = JSON.parse(cached);
    if (
      !Array.isArray(data) ||
      !data.length ||
      !data[0]?.word ||
      !Number.isFinite(cachedAt) ||
      Date.now() - cachedAt > CACHE_TTL_MS
    ) {
      localStorage.removeItem(key);
      return undefined;
    }
    return data;
  } catch (error) {
    console.warn("Could not read cached dictionary entry.", error);
    return undefined;
  }
};

const cacheWord = (word, data) => {
  try {
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${word.toLowerCase()}`,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch (error) {
    console.warn("Could not cache dictionary entry.", error);
  }
};

const createElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const uniqueWords = (words) => [
  ...new Set(
    words
      .filter(Boolean)
      .map((word) => word.trim())
      .filter(Boolean)
  ),
];

const speakWord = (word) => () => {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
};

const canSpeakWord = () =>
  "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

const createSpeechFallback = (word) => {
  if (canSpeakWord()) {
    const speakButton = createElement("button", "audio-btn", "Speak word");
    speakButton.type = "button";
    speakButton.setAttribute("aria-label", `Speak ${word}`);
    speakButton.addEventListener("click", speakWord(word));
    return speakButton;
  }

  return createElement(
    "p",
    "pronunciation-unavailable",
    "Audio pronunciation unavailable."
  );
};

const addPronunciationControl = (actions, word, pronunciation) => {
  const status = createElement("span", "audio-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  if (!pronunciation) {
    actions.appendChild(createSpeechFallback(word));
    return;
  }

  const audio = createElement("audio", "pronunciation-audio");
  audio.preload = "none";
  audio.src = pronunciation.startsWith("//")
    ? `https:${pronunciation}`
    : pronunciation;
  audio.setAttribute("aria-label", `Pronunciation audio for ${word}`);

  const playButton = createElement("button", "audio-btn", "Play audio");
  playButton.type = "button";
  playButton.setAttribute("aria-label", `Play pronunciation for ${word}`);
  let speechFallback = false;
  let speechUnavailable = false;

  const useSpeechFallback = (message) => {
    if (canSpeakWord()) {
      speechFallback = true;
      playButton.textContent = "Speak instead";
      playButton.setAttribute("aria-label", `Speak ${word}`);
    }
    else {
      speechUnavailable = true;
      playButton.disabled = true;
      playButton.textContent = "Audio unavailable";
      status.textContent = message;
    }
  };

  audio.addEventListener("error", () => {
    useSpeechFallback("Audio could not be loaded. Try again later.");
  });
  audio.addEventListener("ended", () => {
    if (!speechFallback) {
      playButton.disabled = false;
      playButton.textContent = "Play audio";
      status.textContent = "";
    }
  });
  playButton.addEventListener("click", async () => {
    if (speechFallback) {
      speakWord(word)();
      status.textContent = "Playing pronunciation with speech synthesis.";
      return;
    }
    if (speechUnavailable) {
      return;
    }

    playButton.disabled = true;
    playButton.setAttribute("aria-busy", "true");
    status.textContent = "Loading pronunciation audio...";
    let timeoutId;
    let audioStarted = false;
    try {
      const playback = Promise.resolve(audio.play()).then(
        () => true,
        () => false
      );
      const startTimeout = new Promise((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve(false),
          AUDIO_START_TIMEOUT_MS
        );
      });
      audioStarted = await Promise.race([playback, startTimeout]);
    } catch {
      audioStarted = false;
    } finally {
      window.clearTimeout(timeoutId);
      playButton.disabled = false;
      playButton.removeAttribute("aria-busy");
    }

    if (audioStarted && !speechFallback) {
      playButton.textContent = "Playing...";
      status.textContent = "Playing pronunciation.";
      return;
    }

    audio.pause();
    useSpeechFallback(
      "Audio did not start quickly. Trying speech pronunciation instead."
    );
    if (canSpeakWord()) {
      speakWord(word)();
      status.textContent =
        "Audio was slow; playing pronunciation with speech synthesis.";
    }
    else if (!speechUnavailable) {
      status.textContent =
        "Audio playback failed. Try again when audio is available.";
    }
  });

  actions.appendChild(playButton);
  actions.appendChild(audio);
  actions.appendChild(status);
};

const renderWord = (data) => {
  const entry = data[0];
  const card = createElement("article", "word-card");
  const header = createElement("div", "word-header");
  const titleGroup = createElement("div", "word-title-group");
  const title = createElement("h2", "", entry.word);
  const phoneticText =
    entry.phonetic || entry.phonetics?.find((phonetic) => phonetic.text)?.text;
  titleGroup.appendChild(title);
  titleGroup.appendChild(
    createElement("p", "phonetic", phoneticText || "Pronunciation unavailable")
  );
  header.appendChild(titleGroup);

  const actions = createElement("div", "word-actions");
  const pronunciation = entry.phonetics?.find(
    (phonetic) => phonetic.audio
  )?.audio;
  addPronunciationControl(actions, entry.word, pronunciation);

  const saved = favorites.includes(entry.word.toLowerCase());
  const saveButton = createElement(
    "button",
    `save-btn${saved ? " saved" : ""}`,
    saved ? "Remove" : "Save word"
  );
  saveButton.type = "button";
  saveButton.setAttribute("aria-pressed", String(saved));
  saveButton.setAttribute(
    "aria-label",
    saved ? `Remove ${entry.word} from saved words` : `Save ${entry.word}`
  );
  saveButton.addEventListener("click", () => {
    const isSaved = toggleFavorite(entry.word);
    if (isSaved === null) return;
    saveButton.classList.toggle("saved", isSaved);
    saveButton.textContent = isSaved ? "Remove" : "Save word";
    saveButton.setAttribute("aria-pressed", String(isSaved));
    saveButton.setAttribute(
      "aria-label",
      isSaved ? `Remove ${entry.word} from saved words` : `Save ${entry.word}`
    );
  });
  actions.appendChild(saveButton);
  header.appendChild(actions);
  card.appendChild(header);

  const meanings = entry.meanings || [];
  const hasDefinitions = meanings.some(
    (meaning) => meaning.definitions?.length
  );
  if (!hasDefinitions) {
    card.appendChild(
      createElement("p", "definition-unavailable", "No definitions available.")
    );
  }

  for (const meaning of meanings) {
    const block = createElement("section", "meaning");
    block.appendChild(
      createElement("h3", "", meaning.partOfSpeech || "Definition")
    );

    for (const definition of meaning.definitions || []) {
      const item = createElement("div", "definition-item");
      item.appendChild(createElement("p", "definition", definition.definition));
      if (definition.example) {
        item.appendChild(
          createElement("p", "example", `“${definition.example}”`)
        );
      }
      block.appendChild(item);
    }

    const synonyms = uniqueWords([
      ...(meaning.synonyms || []),
      ...(meaning.definitions || []).flatMap(
        (definition) => definition.synonyms || []
      ),
    ]);
    const antonyms = uniqueWords([
      ...(meaning.antonyms || []),
      ...(meaning.definitions || []).flatMap(
        (definition) => definition.antonyms || []
      ),
    ]);
    block.appendChild(
      createElement(
        "p",
        "synonyms",
        synonyms.length
          ? `Synonyms: ${synonyms.join(", ")}`
          : "No synonyms available."
      )
    );
    block.appendChild(
      createElement(
        "p",
        "antonyms",
        antonyms.length
          ? `Antonyms: ${antonyms.join(", ")}`
          : "No antonyms available."
      )
    );
    card.appendChild(block);
  }

  if (entry.origin) {
    const origin = createElement("p", "origin");
    origin.appendChild(createElement("strong", "", "Origin: "));
    origin.appendChild(document.createTextNode(entry.origin));
    card.appendChild(origin);
  }

  const sourceUrls = uniqueWords(entry.sourceUrls || []);
  if (sourceUrls.length) {
    const source = createElement("p", "source");
    source.appendChild(document.createTextNode("Source: "));
    sourceUrls.forEach((url, index) => {
      if (!URL.canParse(url)) return;
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) return;
      if (index) source.appendChild(document.createTextNode(", "));
      const link = createElement("a", "", parsedUrl.hostname);
      link.href = parsedUrl.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      source.appendChild(link);
    });
    if (source.childNodes.length > 1) card.appendChild(source);
  }

  results.replaceChildren(card);
};

const toggleFavorite = (word) => {
  const normalizedWord = word.toLowerCase();
  const nextFavorites = favorites.includes(normalizedWord)
    ? favorites.filter((favorite) => favorite !== normalizedWord)
    : [...favorites, normalizedWord];

  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(nextFavorites));
  } catch {
    showError(
      "Your browser could not save this word. Check its storage settings and try again."
    );
    return null;
  }

  favorites = nextFavorites;
  renderFavorites();
  return favorites.includes(normalizedWord);
};

const renderFavorites = () => {
  favoritesList.replaceChildren();
  if (!favorites.length) {
    favoritesList.appendChild(
      createElement("li", "empty-favorites", "No saved words yet")
    );
    return;
  }

  favorites.forEach((word) => {
    const item = createElement("li");
    const button = createElement("button", "favorite-word", word);
    button.type = "button";
    button.addEventListener("click", () => {
      input.value = word;
      handleSearch(word);
    });
    item.appendChild(button);
    favoritesList.appendChild(item);
  });
};

const handleSearch = async (rawWord) => {
  const word = rawWord.trim();
  const cachedData = word ? getCachedWord(word) : undefined;
  clearError();
  statusMessage.textContent = "";
  if (cachedData) {
    renderWord(cachedData);
  }
  else {
    results.replaceChildren();
  }

  if (!word) {
    activeRequest?.abort();
    activeRequest = undefined;
    setLoading(false);
    statusMessage.textContent = "";
    showError("Please enter a word to search.");
    input.focus();
    return;
  }

  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const requestTimeout = window.setTimeout(
    () => controller.abort(),
    SEARCH_TIMEOUT_MS
  );
  setLoading(
    !cachedData,
    cachedData
      ? `Showing saved definition for ${cachedData[0].word}; checking for updates...`
      : "Searching the dictionary..."
  );

  try {
    const data = await fetchWord(word, controller.signal);
    cacheWord(word, data);
    renderWord(data);
    statusMessage.textContent = cachedData
      ? `Definitions for ${data[0].word} updated.`
      : `Definitions for ${data[0].word}.`;
  } catch (error) {
    if (error.name === "AbortError" && activeRequest === controller) {
      showError(
        cachedData
          ? `The update took too long. Showing the saved definition for "${cachedData[0].word}".`
          : "The dictionary request took too long. Check your connection and try again.",
        word
      );
      statusMessage.textContent = cachedData
        ? `Showing saved definition for ${cachedData[0].word}.`
        : "Search unsuccessful.";
    }
    else if (error.name !== "AbortError") {
      showError(
        cachedData
          ? `${error.message} Showing the saved definition for "${cachedData[0].word}".`
          : error.message,
        word
      );
      statusMessage.textContent = cachedData
        ? `Showing saved definition for ${cachedData[0].word}.`
        : "Search unsuccessful.";
    }
  } finally {
    window.clearTimeout(requestTimeout);
    if (activeRequest === controller) {
      activeRequest = undefined;
      setLoading(false);
    }
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleSearch(input.value);
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  themeToggle.textContent = isDark ? "Light Mode" : "Dark Mode";
  themeToggle.setAttribute("aria-pressed", String(isDark));
});

loadFavorites();
renderFavorites();

window.addEventListener("unhandledrejection", (e) =>
  console.log("REJECTION:", e.reason)
);
