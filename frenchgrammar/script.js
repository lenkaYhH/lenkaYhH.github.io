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
    "present subjonctif": true
}

// each question
let answer = '';
let answerTrue = false;

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