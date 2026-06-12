(function () {
  const pages = [
    { href: "dashboard.html", label: "Dashboard", icon: "D", group: "Work" },
    { href: "orders.html", label: "Orders", icon: "O", group: "Work" },
    { href: "pending.html", label: "Pending Orders", icon: "P", group: "Work" },
    { href: "payments.html", label: "Payments", icon: "Rs", group: "Work" },
    { href: "delivery.html", label: "Delivery Proof", icon: "V", group: "Work" },
    { href: "dispatch.html", label: "Dispatch", icon: "S", group: "Work" },
    { href: "recovery.html", label: "Recovery Aging", icon: "R", group: "Reports" },
    { href: "ledger.html", label: "Ledger", icon: "L", group: "Reports" },
    { href: "incentive.html", label: "Incentive Sheet", icon: "I", group: "Reports" },
    { href: "dealers.html", label: "Dealer Master", icon: "C", group: "Master" },
    { href: "products.html", label: "Product Master", icon: "M", group: "Master" },
    { href: "employees.html", label: "Employee Master", icon: "E", group: "Master" },
    { href: "transport.html", label: "Transport", icon: "T", group: "Master" },
  ];

  function currentPage() {
    return window.location.pathname.split("/").pop() || "dashboard.html";
  }

  function buildSidebar(activePage) {
    const aside = document.createElement("aside");
    aside.className = "app-sidebar";

    const brand = document.createElement("div");
    brand.className = "app-brand";
    brand.innerHTML = "<strong>Dharohar CRM</strong><span>Daily operations workspace</span>";
    aside.appendChild(brand);

    let currentGroup = "";
    const nav = document.createElement("nav");
    nav.className = "app-nav";
    nav.setAttribute("aria-label", "Primary");

    pages.forEach((page) => {
      if (page.group !== currentGroup) {
        currentGroup = page.group;
        const section = document.createElement("div");
        section.className = "app-nav-section";
        section.textContent = currentGroup;
        nav.appendChild(section);
      }

      const link = document.createElement("a");
      link.href = page.href;
      if (page.href === activePage) {
        link.setAttribute("aria-current", "page");
      }
      link.innerHTML = `<span class="app-nav-icon">${page.icon}</span><span>${page.label}</span>`;
      nav.appendChild(link);
    });

    aside.appendChild(nav);
    return aside;
  }

  function removeOldSidebar() {
    Array.from(document.body.children).forEach((element) => {
      const className = element.getAttribute("class") || "";
      const looksLikeSidebar = className.includes("bg-green-700") || element.querySelector("a[href='dashboard.html']");

      if (looksLikeSidebar && element.querySelector("ul")) {
        element.remove();
      }
    });
  }

  function alignFiltersWithPrint(main) {
    const filterIds = [
      "orderMonthFilter",
      "paymentMonthFilter",
      "dispatchMonthFilter",
      "deliveryMonthFilter",
      "recoveryMonthFilter",
      "ledgerMonthFilter",
      "month",
      "monthFilter",
    ];

    const filter = filterIds
      .map((id) => main.querySelector(`#${id}`))
      .find((element) => element && element.parentElement);

    if (!filter) return;

    const filterLine = filter.parentElement;
    filterLine.classList.add("filter-print-line");

    const printButton = main.querySelector("button[onclick*='printSectionById'], button[onclick*='printPage']");
    if (printButton && !filterLine.contains(printButton)) {
      filterLine.appendChild(printButton);
    }
  }

  function titleFromDocument() {
    const heading = document.querySelector("h1");
    return heading ? heading.textContent.trim() : document.title;
  }

  function enhanceEntryForms(main) {
    const forms = Array.from(main.querySelectorAll("[data-entry-form]"));
    if (!forms.length) return;

    forms.forEach((form, index) => {
      const title = form.getAttribute("data-entry-title") || `Add ${titleFromDocument()} Entry`;
      const modalId = `entryModal${index}`;
      let header = main.querySelector(".app-page-header, div.mb-6:first-child");
      if (!header) {
        const firstHeading = main.querySelector("h1");
        if (firstHeading && firstHeading.parentElement === main) {
          header = document.createElement("div");
          header.className = "app-page-header";
          main.insertBefore(header, firstHeading);
          header.appendChild(firstHeading);
        } else {
          header = main;
        }
      }
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "entry-open-button bg-green-600 px-4 py-2 text-white";
      trigger.textContent = title;
      trigger.setAttribute("aria-haspopup", "dialog");
      trigger.setAttribute("aria-controls", modalId);

      const modal = document.createElement("div");
      modal.id = modalId;
      modal.className = "entry-modal hidden";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", `${modalId}Title`);

      const panel = document.createElement("div");
      panel.className = "entry-modal-panel";

      const modalHeader = document.createElement("div");
      modalHeader.className = "entry-modal-header";
      modalHeader.innerHTML = `<h2 id="${modalId}Title">${title}</h2>`;

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "entry-modal-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => closeEntryModal(modal));
      modalHeader.appendChild(closeButton);

      form.classList.add("entry-modal-form");
      form.classList.remove("mb-6");
      form.setAttribute("data-entry-modal-content", "");

      panel.appendChild(modalHeader);
      panel.appendChild(form);
      modal.appendChild(panel);
      document.body.appendChild(modal);

      trigger.addEventListener("click", () => openEntryModal(modal));
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeEntryModal(modal);
        }
      });

      header.appendChild(trigger);
    });
  }

  function openEntryModal(modal) {
    modal.classList.remove("hidden");
    modal.classList.add("is-open");
    document.body.classList.add("entry-modal-open");
    const firstField = modal.querySelector("[data-entry-modal-content] input, [data-entry-modal-content] select, [data-entry-modal-content] textarea, [data-entry-modal-content] button");
    if (firstField) firstField.focus();
  }

  function closeEntryModal(modal = document.querySelector(".entry-modal.is-open")) {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("is-open");
    if (!document.querySelector(".entry-modal.is-open")) {
      document.body.classList.remove("entry-modal-open");
    }
  }

  window.openEntryModal = openEntryModal;
  window.closeEntryModal = closeEntryModal;

  function enhanceAppPage() {
    const activePage = currentPage();

    if (activePage === "login.html" || document.title.toLowerCase().includes("login")) {
      document.body.classList.add("login-page");
      return;
    }

    removeOldSidebar();

    const shell = document.createElement("div");
    shell.className = "app-shell";

    const main = document.createElement("main");
    main.className = "app-main";

    while (document.body.firstChild) {
      main.appendChild(document.body.firstChild);
    }

    shell.appendChild(buildSidebar(activePage));
    shell.appendChild(main);
    document.body.appendChild(shell);
    alignFiltersWithPrint(main);
    enhanceEntryForms(main);
    document.body.classList.add("app-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhanceAppPage);
  } else {
    enhanceAppPage();
  }
})();
