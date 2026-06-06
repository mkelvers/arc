import { onReady } from "./utils";

const initSortFilter = (): void => {
  const sortSelect = document.getElementById("sort-select") as HTMLSelectElement | null;
  const orderSelect = document.getElementById("order-select") as HTMLSelectElement | null;

  const submitForm = (): void => {
    const form = document.getElementById("sort-form") as HTMLFormElement | null;
    if (form) form.submit();
  };

  // sync select values to hidden inputs, then submit form
  sortSelect?.addEventListener("change", () => {
    const input = document.getElementById("sort-input") as HTMLInputElement | null;
    if (input) input.value = sortSelect.value;
    submitForm();
  });

  orderSelect?.addEventListener("change", () => {
    const input = document.getElementById("order-input") as HTMLInputElement | null;
    if (input) input.value = orderSelect.value;
    submitForm();
  });
};

onReady(initSortFilter);
