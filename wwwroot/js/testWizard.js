document.addEventListener("DOMContentLoaded", () => {
    const step1 = document.getElementById("step-1");
    const step2 = document.getElementById("step-2");
    const step3 = document.getElementById("step-3");
    
    const dot1 = document.getElementById("dot-1");
    const dot2 = document.getElementById("dot-2");
    const dot3 = document.getElementById("dot-3");
    
    const btnNext = document.getElementById("btn-next");
    const btnBack = document.getElementById("btn-back");
    const controls = document.getElementById("wizard-controls");
    const resultContainer = document.getElementById("result-container");

    let currentStep = 1;
    let selectedObject = [];
    let selectedAction = null;

    // --- Матрица профессий будущего (Пример) ---
    const matrix = {
        "человек": {
            "управление": ["Тайм-брокер", "Менеджер портфеля корпоративных венчурных фондов"],
            "обслуживание": ["Игропрактик", "Специалист по адаптации мигрантов"],
            "образование": ["Тренер по майнд-фитнесу", "Тьютор", "Экопроповедник"],
            "оздоровление": ["Биоэтик", "Сетевой врач", "ИТ-медик"],
            "творчество": ["Трендвотчер", "Science-художник"]
        },
        "информация": {
            "исследование": ["Дата-журналист", "Проектировщик нейроинтерфейсов"],
            "управление": ["Менеджер непрерывности бизнеса", "Модератор сообществ"],
            "защита": ["Киберисследователь", "Аудитор информационной безопасности"],
            "конструирование": ["Проектировщик кибервзломщик", "Архитектор ИС"]
        },
        "техника": {
            "производство": ["Проектировщик 3D-печати в строительстве", "Оператор многофункциональных роботов"],
            "конструирование": ["Архитектор интеллектуальных систем управления", "Проектировщик интерфейсов беспилотной авиации"],
            "обслуживание": ["Специалист по навигации", "Системный горный инженер"]
        },
        "природа": {
            "контроль": ["Эколог-логист", "Портовый эколог"],
            "защита": ["Специалист по преодолению системных экологических катастроф"],
            "исследование": ["Метеоэнергетик", "Специалист по локальным системам энергоснабжения"]
        }
    };

    // Слушатели кнопок
    document.querySelectorAll("#options-1 .option-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const val = btn.dataset.value;
            if (selectedObject.includes(val)) {
                selectedObject = selectedObject.filter(v => v !== val);
                btn.classList.remove("selected");
            } else {
                if (selectedObject.length < 2) {
                    selectedObject.push(val);
                    btn.classList.add("selected");
                } else {
                    // заменяем первый, если кликнули третий
                    const first = selectedObject.shift();
                    document.querySelector(`#options-1 .option-btn[data-value="${first}"]`).classList.remove("selected");
                    selectedObject.push(val);
                    btn.classList.add("selected");
                }
            }
            checkNextButton();
        });
    });

    document.querySelectorAll("#options-2 .option-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            // Только один выбор
            document.querySelectorAll("#options-2 .option-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            selectedAction = btn.dataset.value;
            checkNextButton();
        });
    });

    btnNext.addEventListener("click", () => {
        if (currentStep === 1) {
            currentStep = 2;
            step1.style.display = "none";
            step2.style.display = "block";
            dot2.classList.add("active");
            btnBack.style.visibility = "visible";
            checkNextButton();
        } else if (currentStep === 2) {
            calculateResult();
            currentStep = 3;
            step2.style.display = "none";
            step3.style.display = "block";
            dot3.classList.add("active");
            controls.style.display = "none"; // скрываем кнопки далее/назад
        }
    });

    btnBack.addEventListener("click", () => {
        if (currentStep === 2) {
            currentStep = 1;
            step2.style.display = "none";
            step1.style.display = "block";
            dot2.classList.remove("active");
            btnBack.style.visibility = "hidden";
            checkNextButton();
        }
    });

    function checkNextButton() {
        if (currentStep === 1) {
            btnNext.disabled = selectedObject.length === 0;
        } else if (currentStep === 2) {
            btnNext.disabled = !selectedAction;
        }
    }

    function calculateResult() {
        let results = [];
        
        selectedObject.forEach(obj => {
            if (matrix[obj] && matrix[obj][selectedAction]) {
                results.push(...matrix[obj][selectedAction]);
            }
        });

        // Fallback если в матрице пусто для этой комбинации (для демо)
        if (results.length === 0) {
            results = ["Цифровой лингвист", "Организатор проектного обучения", "Координатор образовательных онлайн-платформ"];
        }

        resultContainer.innerHTML = '';
        results.forEach(res => {
            const el = document.createElement("div");
            el.className = "profession-badge";
            el.innerText = res;
            resultContainer.appendChild(el);
        });
    }
});
