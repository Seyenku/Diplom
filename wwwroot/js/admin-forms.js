// admin-forms.js — лёгкий handler для data-confirm-submit на админских формах.
// Используется в _AdminLayout: формы delete с `data-confirm-submit="Удалить?"`.
// Заменяет inline onsubmit="return confirm(...)" без зависимости от main.ts бандла.
(function () {
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        var msg = form.dataset.confirmSubmit;
        if (msg && !confirm(msg)) {
            e.preventDefault();
        }
    });
})();
