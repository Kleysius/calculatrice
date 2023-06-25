let str = "";
let res = 0;


function calc(elem) {
    if (elem.innerHTML == "×") {
        str += "*";
    } else if (elem.innerHTML == "÷") {
        str += "/";
    } else if (elem.innerHTML == ",") {
        str += ".";

    } else {
        str += elem.innerHTML;
    }
    document.querySelector("#containerResult").innerHTML = str;
}

function enjoy() {
    res = eval(str);
    document.querySelector("#containerResult").innerHTML = res;
}

function reset() {
    document.querySelector("#containerResult").innerHTML = "";
    str = "";
}