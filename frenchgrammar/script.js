// CONSTANTS
let VERBS_LIST = {};
const TENSES = ["present", "passe compose", "plus-que-parfait", "imparfait", "futur proche", "futur simple", "futur anterieur", "present conditionnel", "present subjonctif", "passe simple"];
const PRONOUNS = ["Je", "Tu", "Il/Elle/On", "Nous", "Vous", "Ils/Elles"];

// SETTINGS
let filter  = {
    "present": true,
    "passe compose": true, 
    "plus-que-parfait": true, 
    "imparfait": true, 
    "futur proche": true, 
    "futur simple": true, 
    "futur anterieur": true, 
    "present conditionnel": true, 
    "present subjonctif": true,
    "passe simple": true
}

// each question
let answer = '';
let answerTrue = false;
let chekcedTimes = 0;

// ONLOAD, load JSON
window.addEventListener("load", async () => {

    const filterEls = document.getElementsByClassName("filter");

    for (let i=0; i<filterEls.length; i++) {
        filterEls[i].checked = true;
    }

    const response = await fetch('/frenchgrammar/verbs.json');
    VERBS_LIST = await response.json();
    console.log(VERBS_LIST);

    presentQuestion();

    console.log(Object.keys(VERBS_LIST));
});

function presentQuestion() {

    // clear results
    document.getElementById("result").innerHTML = "";
    answerTrue = false;

    // hide buttones
    checkedTimes = 0;
    document.getElementById("showAnswer-btn").style.display = "none";
    document.getElementById("answer").innerHTML = "";

    if (Object.keys(VERBS_LIST).length === 0) {
        console.warn("VERBS_LIST not loaded yet. Try again shortly.");
        return;
    }

    // randomly generate verb
    let random_verb = Object.keys(VERBS_LIST)[Math.floor(Math.random()*Object.keys(VERBS_LIST).length)]
    
    let random_tense = TENSES[Math.floor(Math.random()*Object.keys(TENSES).length)]
    
    while (!filter[random_tense]) {
        random_tense = TENSES[Math.floor(Math.random()*Object.keys(TENSES).length)]
    }
    
    let random_pronoun = PRONOUNS[Math.floor(Math.random()*Object.keys(PRONOUNS).length)];

    if (random_pronoun == "Je" && ['a', 'e', 'i', 'o', 'u', 'é'].includes(VERBS_LIST[random_verb]["conjugations"][random_tense][random_pronoun][0])) {
        answer = `J'${VERBS_LIST[random_verb]["conjugations"][random_tense][random_pronoun]}`;
    } else {
        answer = `${random_pronoun} ${VERBS_LIST[random_verb]["conjugations"][random_tense][random_pronoun]}`;
    }
    
    
    // console.log(`Verb: ${random_verb}`);
    // console.log(`Tense: ${random_tense}`);
    // console.log(`Pronoun: ${random_pronoun}`);
    // console.log(`Expected answer: ${answer}`);

    // update to the html
    const questionEl = document.getElementById("question");
    questionEl.innerHTML = `<p id="question">${random_pronoun} <i>${random_verb}</i> (${random_tense})</p>
    <input type="text" id="ans" name="ans" value="${random_pronoun} " onkeypress="enter(event)">`;

    // update stats for the total
    if (localStorage.getItem("score") === null) {
        localStorage.setItem("score", 0);
    }
    if (localStorage.getItem("total") === null) {
        localStorage.setItem("total", 0);
    }

    localStorage.setItem("total", parseInt(localStorage.getItem("total"))+1);

    const cntEl = document.getElementById("cnt_total");
    cntEl.innerHTML = `<p id="cnt_total">Réponse correct: ${localStorage.getItem("score")}/${localStorage.getItem("total")}</p>`;

}

function checkAnswer() {
    const inputEl = document.getElementById("ans");
    const resultEl = document.getElementById("result");

    if (localStorage.getItem("score") === null) {
        localStorage.setItem("score", 0);
    }

    checkedTimes++; 

    if (checkedTimes >= 3) {
        document.getElementById("showAnswer-btn").style.display = "inline";
    }

    if (inputEl.value.trim() == answer) {
        resultEl.innerHTML = "✅ Correctes!";

        if (!answerTrue) {
            localStorage.setItem("score", parseInt(localStorage.getItem("score"))+1);
        }

        answerTrue = true;
        
    } else {
        resultEl.innerHTML = "Mauvaise réponse ❌";
    }

    const cntEl = document.getElementById("cnt_total");
    cntEl.innerHTML = `<p id="cnt_total">Réponses correctes: ${localStorage.getItem("score")}/${localStorage.getItem("total")}</p>`;
}

function showAnswer() {
    document.getElementById("answer").innerHTML = `La bonne réponse: <b>${answer}</b>`;
}

function updateFilter() {
    const filterEls = document.getElementsByClassName("filter");
    for (let i=0; i<filterEls.length; i++) {
        filter[filterEls[i].value] = filterEls[i].checked;
    }

    console.log(`Filters applied:`);
    console.log(filter);
}

// allow enter key support
function enter(event) {
    if (event.key === "Enter") {
        event.preventDefault();

        if (!answerTrue) {
            checkAnswer();
        } else {
            presentQuestion();
        }
    }
}

// toggle search function
function toggleSearch() {
    const headingEl = document.getElementById("expand");
    const contentEl = document.getElementById("content");

    if (contentEl.style.display === "none") {
        // open
        contentEl.style.display = "block";
        contentEl.style.height = contentEl.scrollHeight + "px";
        headingEl.style.borderRadius = "10px 10px 0 0";

    } else {
        // close
        contentEl.style.height = 0;
        
        setTimeout(() => {
            contentEl.style.display = "none";
            headingEl.style.borderRadius = "10px";
        }, 200, contentEl);
        
    }
}

// search function -----------------
// suggestion list is Object.keys(VERBS_LIST)
function searchInputChange() {
    const inputEl = document.getElementById("search-verb");
    const suggestionDivEl = document.getElementById("suggestions-div");

    let query = inputEl.value.trim().toLowerCase();
    
    
    if (query === "" || query.length <= 1) {
        suggestionDivEl.innerHTML = "";
        return;
    }

    let filteredList = Object.keys(VERBS_LIST).filter(item => item.toLowerCase().includes(query));

    suggestionDivEl.innerHTML = "";

    filteredList.forEach(item => {
        const div = document.createElement("div");
        div.textContent = item;
        div.classList.add("search-suggestion");
        div.addEventListener("click", () => displayResults(item));

        suggestionDivEl.appendChild(div);
    })

    document.getElementById("content").style.height = document.getElementById("content").scrollHeight + "px";
}

// closes suggestions if elsewhere clicked
document.addEventListener("click", e => {
    const inputEl = document.getElementById("search-verb");
    const suggestionDivEl = document.getElementById("suggestions-div");

    if (!suggestionDivEl.contains(e.target) && e.taret !== inputEl) {
        suggestionDivEl.innerHTML = "";
    }
})

function displayResults(verb) {
    const inputEl = document.getElementById("search-verb");
    const suggestionDivEl = document.getElementById("suggestions-div");
    const resultsGridEl = document.getElementById("results-grid");
    
    // clear
    resultsGridEl.innerHTML = "";
    inputEl.value = verb;
    suggestionDivEl.innerHTML = "";

    TENSES.forEach(tense => {
        const thisDiv = document.createElement("div");
        thisDiv.id = tense;

        thisDiv.innerHTML += `<p><b>${tense}</b></p>`

        PRONOUNS.forEach(pronoun => {
            const thisLine = document.createElement("p");

            let line;

            if (pronoun == "Je" && ['a', 'e', 'i', 'o', 'u', 'é'].includes(VERBS_LIST[verb]["conjugations"][tense][pronoun][0])) {
                line = `J'${VERBS_LIST[verb]["conjugations"][tense][pronoun]}`;
            } else {
                line = `${pronoun} ${VERBS_LIST[verb]["conjugations"][tense][pronoun]}`;
            }

            thisLine.innerHTML = line;

            thisDiv.appendChild(thisLine);
        })

        resultsGridEl.appendChild(thisDiv);
    })

    document.getElementById("content").style.height = document.getElementById("content").scrollHeight + "px";

}