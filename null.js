document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();

        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth',
        });

        // setTimeout(function(){
        //     window.scrollBy({
        //         top: -10,
        //         behavior:'smooth'
        //     }); 
        // }, 2000)
        
    });
});

function panel() {
    let cont = document.getElementById("side-nav");
    let bar1 = document.getElementById('bar1')
    let bar2 = document.getElementById('bar2')
    let bar3 = document.getElementById('bar3')

    if (cont.style.getPropertyValue("--i") === '0') {
        // open the contents
        cont.style.display = 'block';
        cont.style.height = cont.scrollHeight + "px";
        cont.style.width = cont.scrollWidth + "px"
        cont.style.setProperty('--i', '1')
        bar1.style.transition = "0.5s ease-in-out"
        bar2.style.transition = "0.5s ease-in-out"
        bar3.style.transition = "0.5s ease-in-out"
        bar1.style.transform = "rotate(315deg)"
        bar2.style.transform = "rotate(315deg)"
        bar3.style.transform = "rotate(225deg)"
        bar1.style.setProperty('--i', '13')
        bar2.style.setProperty('--i', '9')
        bar3.style.setProperty('--i', '5')
    } else {
        // close the contents
        cont.style.height = 0;
        cont.style.width = 0
        cont.style.setProperty('--i', '0')
        // pausing code for animation
        setTimeout(function(){
            cont.style.display = 'none'; 
        }, 200, cont)

        bar1.style.transition = "0.5s ease-in-out"
        bar2.style.transition = "0.5s ease-in-out"
        bar3.style.transition = "0.5s ease-in-out"
        bar1.style.transform = "rotate(0deg)"
        bar2.style.transform = "rotate(0deg)"
        bar3.style.transform = "rotate(0deg)"
        bar1.style.setProperty('--i', '0')
        bar2.style.setProperty('--i', '9')
        bar3.style.setProperty('--i', '18')
    }
}
// const face = document.getElementById("face");
// const pupils = document.querySelectorAll(".pupil");

// const move = (event) => {
//     let x = (event.clientX/(window.innerWidth/110));
//     let y = (event.clientY/7);
//     let fX = (event.clientX/20);
//     let fY = (event.clientY/20);
    
//     face.style.transform = `translate(${fX}px, ${fY}px)`;
    
//     // document.body.style.backgroundColor = `rgba(${y}, ${x}, ${fY}, 50%)`;
    
//     for (const pupil of pupils) {
//         pupil.style.transform = `translate(${x}px, ${y}px)`;
//     }
// }
                        
// window.addEventListener('mousemove', move);
function process() {
    console.log("clicked");
    let val1 = document.getElementById("num1").value;
    let val2 = document.getElementById("num2").value;
    document.getElementById("res").innerHTML += " Hello World";
}

// SECURITY ----------------------------------------
// shut off page to mobile/tablet users
if (screen.availWidth < 1000) { 
   window.location.replace("https://www.rijnmun.org");
}

// stop right click
document.addEventListener('contextmenu', event => event.preventDefault());

// if the inspect element is opened, then redirect 
if ((window.outerHeight - window.innerHeight) > 150 || (window.outerWidth - window.innerWidth) > 100) {
    window.location.replace("/");
}

window.onresize = function () {
    if ((window.outerHeight - window.innerHeight) > 100 || (window.outerWidth - window.innerWidth) > 20) {
        window.location.replace("/");
    }
}

// PASSWORD---------------------------------
// a (index 0, keycode 97)
const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];

function formKey(word) {
    let k = [];
    for (let i=0; i<word.length; i++) {
        k.push(word[i].charCodeAt(0));
    }
    return k;
}    

let code = formKey('revelio');
let lock = [];
document.onkeypress = function (key) {
    // console.log(code);
    // console.log(lock);
    key = key || window.event;
    // console.log(`key typed: ${key.keyCode}`);
    
    if (code.length) {
        // to unlock
        if (key.keyCode == code[0]) {
            // removes first letter if it is typed
            code.shift();
            // if unlocked
            if (code.length == 0) {
                // unlock
                let wish = prompt("What page do you want to go to?", "Home");
                if (wish == "csp") {
                    show_content();
                    checkin();
                } else {
                    window.location.replace("/");
                }
                // forms lock
                lock = formKey('finite');
            }
        } else {
            // if mistype, return home
            // window.location.replace("/");
            // console.log("returning home, wrong code");
            freak_out()
        }
    } else {
        // to lock back
        if (key.keyCode == lock[0]) {
            // removes first letter if it is typed
            lock.shift();
            // if successfully locked
            if (lock.length == 0) {
                // lock back
                hide_content();
                // forms code back
                code = formKey('revelio');
            }
        }
        // if (key.keyCode===104) {
        //     window.location.replace("/");
        // } else 
        if (key.keyCode == 109) {
            panel();
        }
        // ok so now you can type anything u want if the page is unlocked
        // } else {
        //     // if mistype, return home
        //     freak_out()
        // }
    }
    
}

function show_content() {
    document.getElementById('title').innerHTML = "Classified Creator Support Page";
    document.getElementsByClassName("real-content")[0].style.display = "block";
    document.getElementsByClassName("cover")[0].style.display = "none";
}
function hide_content() {
    document.getElementById('title').innerHTML = "Board of Directors";
    document.getElementsByClassName("real-content")[0].style.display = "none";
    document.getElementsByClassName("cover")[0].style.display = "block";
}

// TESTING ----------
function checkin() {
    var currentdate = new Date()
    var datetime = currentdate.getDay() + "/" + currentdate.getMonth() + "/" + currentdate.getFullYear()
    if (document.cookie != '') {
        let cookies = document.cookie.split("; ")
        let name = cookies[0].split("=")[1]
        let time_away = cookies[2].split("=")[1]
        document.cookie = `name=${name}; Secure`
        document.cookie = `lastSeen=${time_away}; SameSite=Strict; Secure`
        document.cookie = `newTime=${datetime}; SameSite=Strict; Secure`
        document.getElementById("last_sign_in").innerText = `${name} was last seen on ${time_away}`
    } else {
        let get_name = window.prompt("Your username: ")
        if (get_name != null) {
            document.cookie = `name=${get_name}; SameSite=Strict; Secure`
            document.cookie = `lastSeen=${datetime}; SameSite=Strict; Secure`
            document.cookie = `newTime=${datetime}; SameSite=Strict; Secure`
            let name = get_name
            let time_away = datetime
            document.getElementById("last_sign_in").innerText = `${name} was last seen on ${time_away}`
        }
    }
}

// SPECIAL CONTENT -------------------------------------------

window.addEventListener ("blur", () =>{
    document.title = "Come back plz 🥲"
})
window.addEventListener ("focus", () =>{
    document.title = "RijnMUN"
})
// more hidden buttons :)
document.onkeydown = function surprise(e) {
    e = e || window.event;
    // ensures only accessed if page unlocked
    if (e.metaKey === true && e.shiftKey === true && lock.length > 0) {
        // feel free to change the link regularly so it's a surprise every time lol
        // oh and alan, if you do read this, ask me about how i chose the keys (it was so much more complicated than you'd imagine-)
        alert("you're about to witness the mathematical beauty of the PEPSI MANIFESTO- enjoy! (pretty sure at one point it starts talking about the golden ratio but then on the pepsi logo lmao)")
        window.location.replace('https://www.goldennumber.net/wp-content/uploads/pepsi-arnell-021109.pdf');
    }
}
function chaos() {
    let resp = prompt("are you sure you want to proceed? y/n")
    if (resp=="no" || resp=="No" || resp=="n") {
        alert("too bad, too late");
    }
    alert("let the chaos begin \(￣︶￣*\))");
    i = 0;
    var msg = "You messed up buddy :)";
    while (true) {
        alert(msg);
        i += 1;
        if (i > 15) {
            if (!window.confirm("Do you want to end the infinite loop?")) {
                alert("good job\nalways embrace the chaos :)");
                break;
            } else {
                i = 0;
                msg = "You really really really really really really really really really messed up\n good luck :)";
                alert(msg);
            }
        }
    }
}
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
const freak_out = async () => {
    document.getElementById('surprise').style.display = "block"
    document.querySelector('header').style.display = "none"
    document.querySelector('main').style.display = "none"
    document.querySelector('footer').style.display = "none"
    document.querySelector('html').style.backgroundColor = "black"
    document.querySelector('head').innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Security Protocol</title>'
    await sleep(2000)
    document.getElementById('surprise').innerHTML = "Fetching data...<br>"
    await sleep(2000)
    document.getElementById('surprise').innerHTML += "Data fetched. Connecting to server...<br>"
    await sleep(2000)
    a = Math.floor(Math.random()*1000)
    b = Math.floor(Math.random()*1000)
    c = Math.floor(Math.random()*1000)
    d = Math.floor(Math.random()*1000)
    document.getElementById('surprise').innerHTML += `Connected to server ${a}.${b}.${c}.${d}<br>`
    await sleep(500)
    document.getElementById('surprise').innerHTML += "Sending data...<br>"
    await sleep(2000)
    document.getElementById('surprise').innerHTML += "Transmission complete<br>"
    await sleep(2000)
    document.getElementById('surprise').innerHTML += "Closing connection and wiping traces...<br>"
    await sleep(2000)
    document.getElementById('surprise').innerHTML += "Thank you for submitting your personal data<br>"
    await sleep(6000)
    document.getElementById('surprise').innerHTML += "Redirecting back to home page...<br>"
    await sleep(1000)
    document.getElementById('surprise').innerHTML = ""
    await sleep(100)
    alert("Please note that what you just saw was only a joke, and that none of your data was actually collected. However, we strongly urge you not to try and do what you just did again.\nKind Regards,\nThe RijnMUN website creators and tech gods")
    window.location.replace("/")
}

function speak_up() {
    const source = document.getElementById("siri_input");
    const text = source.value;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance)
    source.value = "";
}
