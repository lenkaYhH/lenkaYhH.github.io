let VERBS_LIST = {};

const TENSES = ["present", "passe compose", "plus-que-parfait", "imparfait", "futur proche", "futur simple", "futur anterieur", "conditionnel present", "subjonctif present"];

const PRONOUNS = ["Je", "Tu", "Il/Elle/On", "Nous", "Vous", "Ils/Elles"];

let answer = '';

window.addEventListener("load", async () => {
    const response = await fetch('/frenchgrammar/verbs.json');
    VERBS_LIST = await response.json();
    console.log(VERBS_LIST);

    presentQuestion();
});

function presentQuestion() {

    // clear results
    document.getElementById("result").innerHTML = "";

    if (Object.keys(VERBS_LIST).length === 0) {
        console.warn("VERBS_LIST not loaded yet. Try again shortly.");
        return;
    }

    // randomly generate verb
    let random_verb = Object.keys(VERBS_LIST)[Math.floor(Math.random()*Object.keys(VERBS_LIST).length)]
    
    let random_tense = TENSES[Math.floor(Math.random()*Object.keys(TENSES).length)]
    
    let random_pronoun = PRONOUNS[Math.floor(Math.random()*Object.keys(PRONOUNS).length)];
    
    answer = `${random_pronoun} ${VERBS_LIST[random_verb]["conjugations"][random_tense][random_pronoun]}`;
    
    console.log(`Verb: ${random_verb}`);
    console.log(`Tense: ${random_tense}`);
    console.log(`Pronoun: ${random_pronoun}`);
    console.log(`Expected answer: ${answer}`);

    // update to the html
    const questionEl = document.getElementById("question");
    questionEl.innerHTML = `<p id="question">${random_pronoun} <i>${random_verb}</i> (${random_tense})</p>
    <input type="text" id="ans" name="ans" value="${random_pronoun} ">`;

}

function checkAnswer() {
    const inputEl = document.getElementById("ans");
    const resultEl = document.getElementById("result");

    if (localStorage.getItem("score") === null) {
        localStorage.setItem("score", 0);
    }

    if (localStorage.getItem("total") === null) {
        localStorage.setItem("total", 0);
    }

    if (inputEl.value == answer) {
        resultEl.innerHTML = "✅ Correctes!";
        localStorage.setItem("score", parseInt(localStorage.getItem("score"))+1);
        localStorage.setItem("total", parseInt(localStorage.getItem("total"))+1);
        
    } else {
        resultEl.innerHTML = "Mauvaise réponse ❌";
        localStorage.setItem("total", parseInt(localStorage.getItem("total"))+1);
    }

    const cntEl = document.getElementById("cnt_total");
    cntEl.innerHTML = `<p id="cnt_total">Réponses correctes: ${localStorage.getItem("score")}/${localStorage.getItem("total")}</p>`;
}

function updateStats() {

}