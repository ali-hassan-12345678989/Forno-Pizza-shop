/**
 * Every user-facing string in the app. Screens import from here and never
 * inline text, so wording changes are one edit in one file — and translating
 * later means copying this file, not hunting through components.
 *
 * Anything that depends on shop data is a function taking that data, because
 * the shop's own details live in the database (shop_settings), not here.
 */
/**
 * "last Wednesday" or "the last 4 Wednesdays".
 *
 * Shared by the dashboard's three pacing lines so they cannot phrase the same
 * comparison three slightly different ways. Naming the weekday is the point:
 * "the last 4 same days" is technically accurate and reads like a machine
 * wrote it.
 */
function samplesText(samples, weekday) {
  return samples === 1 ? `last ${weekday}` : `the last ${samples} ${weekday}s`
}

export const COPY = {
  brand: {
    homeAriaLabel: (name) => `${name} — home`,
  },

  common: {
    skipToContent: 'Skip to content',
    startOrder: 'Start order',
    backToHome: 'Back to home',
    loading: 'Loading…',
    retry: 'Try again',
    currencyNote: 'Prices include tax',
    settingsErrorTitle: 'We could not reach the kitchen',
    settingsErrorBody: 'Something went wrong loading the shop details. Please try again.',
    /* Deliberately not "an error occurred". The customer's real question after
       a failed checkout is whether the shop has their order, and the phone
       number is in the header either way. */
    /* Shown wherever a customer might start an order while the kitchen is
       shut. It names a time to come back, because that is something they can
       act on — "we are closed" on its own is not. */
    closedTitle: 'The kitchen is closed right now.',
    closedBody: 'We are not taking orders at the moment. Please check back soon.',
    closedBackAt: (time) => `We start taking orders again at ${time}.`,
    /* A newer version of the site shipped while this tab was open, so the code
       this page wants is no longer on the server. Deliberately not phrased as
       an error: nothing is broken and nothing is lost, and "we updated" is
       both true and reassuring where "something went wrong" is neither. */
    staleChunkTitle: 'The shop has been updated',
    staleChunkBody: 'Reload the page to pick up the latest version. Your cart is kept.',
    reloadPage: 'Reload the page',
    renderErrorTitle: 'Something went wrong on this page',
    renderErrorBody:
      'Your order has not been placed. Try again, or call us and we will take it over the phone.',
  },

  header: {
    phonePrefix: 'Order by phone:',
    nav: {
      home: 'Home',
      menu: 'Menu',
      track: 'Track order',
      /* Replaces "Track order" once signed in: the history lists every order
         with its status and links each one to its own tracker, so keeping both
         would be two doors into the same room. */
      orders: 'Orders',
    },
    cart: 'Cart',
    cartAriaLabel: 'View your cart',
    cartAriaLabelWithCount: (n) => `View your cart, ${n} item${n === 1 ? '' : 's'}`,
    /* Announced when the count changes, so adding to the cart from the menu is
       not a silent event for anyone not watching the badge. */
    cartAnnouncement: (n) => `${n} item${n === 1 ? '' : 's'} in your cart`,
    mobileNavLabel: 'Main',
    cartItemCount: (n) => `${n} item${n === 1 ? '' : 's'} in cart`,
    /* Two navigation landmarks must not share a name, even though only one is
       ever on screen at a time — a screen reader lists them together. */
    primaryNavLabel: 'Primary',
  },

  nav: {
    backToHome: 'Back to home',
    backToMenu: 'Back to menu',
    backToCart: 'Back to cart',
  },

  footer: {
    note: (tagline, hours) => `${tagline}, made to order. ${hours}.`,
    findUs: 'Find us',
    orderByPhone: 'Order by phone',
  },

  home: {
    heroHeadingLine1: 'Wood-fired pizza,',
    heroHeadingLine2: 'hot to your door.',
    lede: 'Hand-stretched, blistered in a 400° oven, and on its way in minutes. No account needed — order as a guest and pay cash.',
    orderTypeLabel: 'Order type',
    delivery: 'Delivery',
    pickup: 'Pickup',
    addressPlaceholder: 'House 12, Street 4, F-7/2',
    addressAriaLabel: 'Delivery address',
    collectFrom: 'Collect from',
    addressLater: 'You can add your address later at checkout.',
    deliveryEta: (eta) => `Delivery in ${eta}`,
    pickupEta: (eta) => `Ready for pickup in ${eta}`,
    cashOn: (isDelivery) => `Cash on ${isDelivery ? 'delivery' : 'pickup'}`,
    heroAriaLabel: 'Start your order',
    heroImageAlt: 'A freshly baked wood-fired pizza with charred crust',
    /* Sits under the order controls, never above them: an account is an offer
       here, and the primary action on this page is still Start order. */
    authReturning: 'Ordered before?',
    authNew: 'New here?',
    authSeparator: '·',
    trustAriaLabel: 'Why order from us',
    trust: {
      noAccountTitle: 'No account needed',
      noAccountBody: 'Check out as a guest in under a minute',
      cashTitle: (isDelivery) => `Cash on ${isDelivery ? 'delivery' : 'pickup'}`,
      cashBody: 'Pay when it reaches you — no card required',
      trackTitle: 'Track every order',
      trackBody: 'Watch it go from oven to door, live',
    },
    stepsAriaLabel: 'How ordering works',
    stepsHeading: "Three steps, that's it",
    steps: [
      {
        title: 'Pick your pizza',
        body: 'Choose a size — every price is shown up front.',
      },
      {
        title: 'Tell us where',
        body: 'Name, phone, address. Guest checkout, no sign-up.',
      },
      {
        title: 'We fire it up',
        body: 'Track it live, then pay cash when it lands.',
      },
    ],
  },

  menu: {
    title: 'Our menu',
    subtitle: 'Wood-fired to order. Pick a size, then add to cart.',
    ariaLabel: 'Menu',
    itemCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
    /** Domino's PK's own badge vocabulary — new / hot / vegetarian / best-seller. */
    badges: {
      'best-seller': 'Bestseller',
      hot: 'Spicy',
      vegetarian: 'Veggie',
      new: 'New',
    },
    /* The card no longer shows one price: sizes and extras are chosen in the
       item view, so the card advertises the cheapest way in. */
    fromPrice: (price) => `From ${price}`,
    allCategories: 'All',
    categoryNavLabel: 'Menu categories',
    addToCart: 'Add to cart',
    soldOut: 'Sold out',
    unavailable: 'Unavailable',
    empty: 'Nothing on the menu yet.',
    emptyHint: 'Check back shortly — we are still firing up the oven.',
    loadError: 'We could not load the menu.',
  },

  /** The item view: pick a size, add extras, choose how many. */
  item: {
    openLabel: (name) => `${name} — choose a size and extras`,
    close: 'Close',

    sizeStepLabel: 'Step 1',
    sizeHeading: 'Choose size',
    required: 'Required',

    toppingsStepLabel: 'More',
    toppingsHeading: 'Add extra toppings',
    optional: 'Optional',
    toppingsGroupLabel: 'Extra toppings',
    free: 'Free',
    plusPrice: (price) => `+ ${price}`,

    quantityLabel: 'How many',
    decrease: 'One fewer',
    increase: 'One more',

    addToOrder: 'Add to order',
    soldOut: 'Sold out',
    unavailable: 'Unavailable',
    maxReached: (max) => `Max ${max} per item`,
  },

  cart: {
    title: 'Your cart',
    ariaLabel: 'Your cart',
    emptyTitle: 'Your cart is empty',
    emptyBody: 'Add something from the menu and it will show up here.',
    browseMenu: 'Browse the menu',
    itemsHeading: (n) => `${n} item${n === 1 ? '' : 's'}`,
    unitEach: (price) => `${price} each`,
    /* Extras are part of what was ordered, so they belong on the line rather
       than only in the price that mysteriously does not match the menu. */
    extras: (names) => `+ ${names.join(', ')}`,
    quantityLabel: (name) => `Quantity for ${name}`,
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    remove: 'Remove',
    removeLabel: (name) => `Remove ${name}`,
    summaryTitle: 'Order summary',
    subtotal: 'Subtotal',
    deliveryFee: 'Delivery fee',
    pickupFee: 'Pickup',
    pickupFree: 'Free',
    total: 'Total',
    checkout: 'Go to checkout',
    keepShopping: 'Add more items',
    deliveringTo: 'Delivering to',
    collectingFrom: 'Collecting from',
    noAddressYet: 'Address added at checkout',
    changeOrderType: 'Change',
    maxReached: (max) => `Max ${max} per item`,
  },

  checkout: {
    title: 'Checkout',
    ariaLabel: 'Checkout',
    emptyTitle: 'Nothing to check out',
    emptyBody: 'Your cart is empty — add something from the menu first.',

    detailsHeading: 'Where should we bring it?',
    detailsHeadingPickup: 'Who is collecting?',
    detailsSubDelivery: (eta) => `Delivery in ${eta} · No account required`,
    detailsSubPickup: (eta, where) => `Ready in ${eta} at ${where} · No account required`,

    nameLabel: 'Full name',
    namePlaceholder: 'Ayesha Khan',
    phoneLabel: 'Phone number',
    phonePlaceholder: '3001234567',
    phoneHint: 'We only call about this order',
    addressLabel: 'Delivery address',
    addressPlaceholder: 'House 12, Street 4, F-7/2, Islamabad',
    notesLabel: 'Delivery notes',
    notesLabelPickup: 'Order notes',
    notesOptional: 'optional',
    notesPlaceholder: 'Ring the bell, gate is on the left',
    notesPlaceholderPickup: 'Anything we should know — no olives, extra napkins',
    notesCounter: (used, max) => `${used}/${max}`,

    /** Keyed to the values returned by lib/validation.js. */
    errors: {
      nameRequired: 'Enter your name',
      nameTooShort: 'That name looks too short',
      nameTooLong: 'That name is too long — 80 characters at most',
      phoneRequired: 'Enter a phone number',
      phoneInvalid: 'Enter a Pakistani mobile number, e.g. 0300 1234567',
      addressRequired: 'Enter a delivery address',
      addressTooShort: 'Add a bit more detail so we can find you',
      addressTooLong: 'That address is too long — 300 characters at most',
      notesTooLong: 'Notes are too long',
      formInvalid: 'Please fix the highlighted fields',
    },

    /* Shown only when something was actually filled in, so it explains a
       change the customer just watched happen rather than announcing a feature. */
    prefilled: 'Filled in from your last order.',
    prefilledClear: 'Clear',

    guestBanner: 'You are ordering as a guest.',
    guestBannerAction: 'Sign in',
    guestBannerSuffix: 'for faster checkout next time — optional.',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',

    summaryTitle: 'Order summary',

    stepsLabel: 'Checkout progress',
    steps: {
      order: 'Your order',
      details: 'Details & payment',
      confirm: 'Confirm',
    },

    paymentHeading: 'Payment',
    paymentSub: 'Cash only for now — pay when your order arrives, or at pickup.',
    cashTitle: (isDelivery) => `Cash on ${isDelivery ? 'delivery' : 'pickup'}`,
    cashBody: 'Have the exact amount ready if you can — it speeds things up.',
    cashOnlyNote: 'No card or online payment needed.',
    payOnDelivery: (amount) => `You will pay ${amount} in cash.`,
    payOnPickup: (amount) => `You will pay ${amount} in cash at the counter.`,

    placeOrder: (amount) => `Place order · ${amount}`,
    placingOrder: 'Placing your order…',
    trustNoFees: 'Full price shown — nothing added later.',

    /**
     * Raised by the place_order() Postgres function. The form checks the same
     * rules first, so most of these only ever appear if something got past it —
     * but they must still read like something a customer can act on.
     */
    orderErrors: {
      invalid_fulfillment_type: 'Choose delivery or pickup and try again.',
      invalid_name: 'Enter your name',
      name_too_long: 'That name is too long — 80 characters at most',
      address_too_long: 'That address is too long — 300 characters at most',
      invalid_phone: 'Enter a Pakistani mobile number, e.g. 0300 1234567',
      invalid_address: 'Add a bit more detail so we can find you',
      invalid_notes: 'Notes are too long',
      empty_cart: 'Your cart is empty — add something from the menu first.',
      too_many_lines: 'That is too many different items for one order.',
      item_unavailable: 'Something in your cart just sold out. Check your cart and try again.',
      rate_limited: 'That is a lot of orders at once. Give it a minute and try again.',
      settings_missing: 'We could not reach the kitchen. Please try again.',
      /* Both of these are about the extras on one line, and both used to fall
         through to `unknown` — "we could not place your order, please try
         again" — which is the worst possible answer, because trying again
         produces exactly the same result forever and never says which choice
         is the problem. They name the step so there is something to change. */
      /* Raised by the trigger on the orders table. A customer who got this far
         saw the banner on the menu and the checkout already, so this is the
         backstop rather than the announcement — it happens when the shop closed
         between opening the page and pressing the button. */
      shop_closed:
        'The kitchen has closed. Your order has not been placed — please try again when we reopen.',
      too_many_toppings: 'That is too many extras on one item. Remove a few and try again.',
      topping_unavailable:
        'One of the extras you picked is no longer available. Open that item and choose again.',
      /* Raised when the kitchen has run out of something the order needs. It
         deliberately does not say which ingredient — that is the shop's recipe,
         and it is not something a customer could act on anyway. Pointing them
         back at the menu is, because the sold-out items there are the answer. */
      out_of_stock:
        'The kitchen has just run out of something on your order. Check the menu — anything sold out is marked.',
      /* A menu item with no recipe behind it. A customer can do nothing about
         this, so it reads as our problem, which it is. */
      /* Both of these mean the menu and the store room disagree. Nothing the
         customer can do about either, so they read the same way. */
      ingredient_missing:
        'Something on your order is not available right now. Please remove it and try again.',
      recipe_missing:
        'Something on your order is not available right now. Please remove it and try again.',
      unknown: 'We could not place your order. Please try again.',
    },
  },

  /**
   * Accounts. Used by the header modal, the checkout panel and the orders page,
   * which is exactly why these no longer live inside `checkout`.
   */
  auth: {
    logIn: 'Log in',
    signUp: 'Sign up',
    modeLabel: 'Log in or create an account',

    signInTitle: 'Welcome back',
    signInSub: 'Log in to see your past orders and check out faster.',
    signUpTitle: 'Create your account',
    signUpSub: 'Save your details for next time. Ordering never requires an account.',

    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    passwordHint: 'At least 8 characters',
    showPassword: 'Show password',
    hidePassword: 'Hide password',

    submitSignIn: 'Log in',
    submitSignUp: 'Create account',
    busy: 'Just a moment…',

    continueAsGuest: 'Continue as guest',
    close: 'Close',
    neverForced: 'You never need an account to order — guest checkout is always open.',

    errors: {
      emailRequired: 'Enter your email',
      emailInvalid: 'That email does not look right',
      passwordRequired: 'Enter a password',
      passwordTooShort: 'Use at least 8 characters',
    },

    /** Header account menu, once signed in. */
    accountMenuLabel: 'Your account',
    signedInAs: 'Signed in as',
    myOrders: 'Your orders',
    signOut: 'Sign out',
  },

  confirmation: {
    ariaLabel: 'Order confirmation',
    heading: 'Order placed',
    sub: (name) => `Thanks, ${name} — the oven is already on.`,
    orderNumberLabel: 'Order number',
    placedAt: (time) => `Placed at ${time}`,

    etaDelivery: (eta) => `Arriving in about ${eta}`,
    etaPickup: (eta) => `Ready for pickup in about ${eta}`,

    payHeading: (isDelivery) => `Pay ${isDelivery ? 'on delivery' : 'at the counter'}`,
    payAmount: (amount) => `Have ${amount} in cash ready.`,

    trackHeading: 'Save your tracking link',
    trackBody:
      'This link is the only way back to your order without an account. Keep it somewhere safe.',
    trackBodySignedIn: 'This order is also saved to your account, under Your orders.',
    copyLink: 'Copy link',
    copied: 'Copied',
    backToMenu: 'Order something else',
  },

  track: {
    title: 'Your order',
    documentTitle: (orderNumber) => `Order #${orderNumber}`,
    ariaLabel: 'Order tracking',
    statuses: {
      placed: 'Order placed',
      preparing: 'In the oven',
      out_for_delivery: 'Out for delivery',
      ready_for_pickup: 'Ready for pickup',
      delivered: 'Delivered',
      picked_up: 'Picked up',
      cancelled: 'Cancelled',
    },
    liveNote: 'This page keeps itself up to date — leave it open.',

    /* The four-stage trail. Stage names come from `statuses` above so the badge
       in order history and the step in the trail can never drift apart; these
       are only the things the trail alone needs. */
    trail: {
      heading: 'Progress',
      /* Read out by screen readers in place of the marker shape, which carries
         the same meaning visually. */
      stateDone: 'Done',
      stateCurrent: 'Happening now',
      statePending: 'Still to come',
      /* Shown under the stage the order is actually on, and nowhere else — a
         note on every row turns a glanceable trail into a paragraph. */
      notes: {
        placed: 'We have your order and the kitchen has it on screen.',
        preparing: 'Hand-stretched, topped, and into the wood oven.',
        out_for_delivery: 'On the way to you now.',
        ready_for_pickup: 'Waiting for you at the counter.',
        delivered: 'Enjoy it while it is hot.',
        picked_up: 'Enjoy it while it is hot.',
      },
      cancelledTitle: 'Order cancelled',
      cancelledBody: 'Nothing is being prepared and there is nothing to pay.',
    },

    cancel: {
      action: 'Cancel this order',
      /* Says the rule before they tap, so "too late" is never the first they
         hear of it. */
      note: 'You can cancel any time before the kitchen starts your order.',

      confirmTitle: (orderNumber) => `Cancel order #${orderNumber}?`,
      confirmBody:
        'The kitchen has not started it yet, so nothing is wasted — but this cannot be undone.',
      /* Optional, and it says so. Every word here is the customer's own
         reason: staff cannot cancel an order in this system, so this is the
         only place a cancellation ever comes from. Must match the check
         constraint on orders.cancelled_reason. */
      reasonLegend: 'Why are you cancelling? (optional)',
      reasons: {
        changed_mind: 'Changed my mind',
        ordered_by_mistake: 'Ordered by mistake',
        wrong_details: 'Wrong address or details',
        too_slow: 'Taking too long',
        other: 'Another reason',
      },

      confirmKeep: 'Keep my order',
      confirmCancel: 'Yes, cancel it',
      working: 'Cancelling…',

      /* Every one of these is a state the database can actually return. The
         window closing mid-tap is the realistic one: the kitchen pressed start
         while the confirmation was open. */
      errors: {
        cancel_window_closed: 'Too late — the kitchen has already started this one.',
        already_cancelled: 'This order is already cancelled.',
        order_not_found: 'We could not find that order.',
        invalid_reason: 'That reason was not one we recognise. Try again without picking one.',
        unknown: 'Something went wrong cancelling that.',
      },
      /* A failed cancellation is the one moment a phone number beats a retry
         button: the pizza is being made either way. */
      callInstead: (phone) => `Call the shop on ${phone}`,
    },

    deliveringTo: 'Delivering to',
    collectingFrom: 'Collecting from',
    contact: 'Contact',
    notesLabel: 'Notes',

    itemsHeading: 'What you ordered',

    lookupTitle: 'Find your order',
    lookupBody: 'Paste the tracking link we gave you when you ordered.',
    lookupLabel: 'Tracking link or code',
    lookupPlaceholder: 'https://… /track/…',
    lookupSubmit: 'Find my order',
    lookupInvalid: 'That does not look like a tracking link.',
    lastOrder: 'Open your last order',

    notFoundTitle: 'We could not find that order',
    notFoundBody: 'The link may be mistyped or incomplete. Check it and try again.',
    loadError: 'We could not load that order. Please try again.',
  },

  orders: {
    title: 'Your orders',
    ariaLabel: 'Your order history',
    signedInAs: 'Signed in as',
    signOut: 'Sign out',
    signedOutBody:
      'Your past orders are saved to your account. Sign in, or create one — ordering never requires it.',

    loading: 'Loading your orders…',
    loadError: 'We could not load your orders.',

    emptyTitle: 'No orders yet',
    emptyBody: 'Once you order with this account, everything you have had will be listed here.',
    /* "Order again" rather than "Reorder": it is what a customer would say,
       and it is a promise the button keeps — the same food, not a form. */
    reorder: 'Order again',
    reorderGoToCart: 'Go to cart',
    reorderNothing: 'Nothing from this order is on the menu right now.',
    /* Names what is missing rather than saying "some items are unavailable".
       A customer who knows the olives were dropped can decide; one who is told
       "some items" has to compare two lists themselves. */
    reorderPartial: (added, missing) =>
      `Added ${added} item${added === 1 ? '' : 's'} to your cart. ` +
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} no longer available.`,
    browseMenu: 'Browse the menu',

    countHeading: (n) => `${n} order${n === 1 ? '' : 's'}`,
    /* The size has to be here: two Larges and two Mediums of the same pizza are
       different money, and a row reading "2 × Chicken Tikka · Rs. 3100" next to
       one reading "1 × Chicken Tikka · Rs. 1050" looks like a billing error. */
    itemSummary: (items) =>
      items
        .map((i) => {
          const extras = (i.toppings ?? []).length
          return `${i.quantity} × ${i.name} (${i.sizeLabel})${extras ? ` +${extras}` : ''}`
        })
        .join(', '),
    delivery: 'Delivery',
    pickup: 'Pickup',

    /* Orders placed before signing in have no account attached, so saying
       nothing here would read as lost orders rather than guest ones. */
    guestNoteTitle: 'Ordered as a guest?',
    guestNoteBody: 'Guest orders are not listed here — open them with your tracking link.',
    guestNoteAction: 'Find a guest order',
  },

  /**
   * Reviews. FR-4.1 to FR-4.3 — leaving one, and reading them on a dish.
   */
  reviews: {
    /* On the tracking page, once the food has actually arrived. */
    heading: 'How was it?',
    sub: 'Only you can leave this — it is tied to your order.',
    experienceLabel: 'The order overall',
    experienceHint: 'Delivery, timing, how it turned up',
    itemHint: 'How was this one?',

    ratingLabel: (n) => `${n} out of 5`,
    ratingLegend: 'Rating',
    commentLabel: 'Anything to add? (optional)',
    commentPlaceholder: 'What was good, what was not…',
    submit: 'Post review',
    submitting: 'Posting…',
    posted: 'Thanks — posted',
    /* Shown in place of the form once this one is done. */
    yours: 'Your rating',

    errors: {
      invalid_rating: 'Pick a rating from 1 to 5.',
      invalid_comment: 'That comment is too long — keep it under 500 characters.',
      order_not_found: 'We could not find that order.',
      order_not_delivered: 'You can review once your order has arrived.',
      item_not_on_order: 'That was not on this order.',
      already_reviewed: 'You have already reviewed this.',
      unknown: 'We could not post that. Please try again.',
    },

    /* On the menu card and inside the item popup. */
    none: 'No reviews yet',
    summary: (average, count) => `${average} (${count})`,
    countLabel: (n) => `${n} review${n === 1 ? '' : 's'}`,
    listHeading: 'What people said',
    anonymous: 'A customer',
    loadError: 'We could not load the reviews.',
    /* A star rating is a picture; this is what a screen reader hears instead. */
    starsLabel: (average, count) =>
      count === 0
        ? 'No reviews yet'
        : `Rated ${average} out of 5, from ${count} review${count === 1 ? '' : 's'}`,
  },

  placeholder: {
    comingIn: (task) => `Coming in ${task}.`,
    notFoundTitle: 'Page not found',
    notFoundBody: 'That page does not exist.',
  },

  /** Manager and Admin. Never linked from the customer UI. */
  staff: {
    loginTitle: 'Staff sign in',
    loginSub: 'Manager and Admin accounts only. Customer accounts cannot sign in here.',
    documentTitle: 'Staff sign in',

    email: 'Work email',
    emailPlaceholder: 'you@forno.pk',
    password: 'Password',
    passwordPlaceholder: '••••••••',
    submit: 'Sign in',
    busy: 'Checking…',
    signOut: 'Sign out',
    signedInAs: 'Signed in as',

    checking: 'Checking your access…',

    /** Shown to a visitor with no session at all. */
    needsSignIn: 'Sign in to continue.',

    /**
     * Shown to someone signed in who is not staff, and to staff who opened the
     * other panel. Deliberately the same wording for both: telling a customer
     * that a Manager panel exists at this address, and that they merely have
     * the wrong role, is more than they need to know.
     */
    notAuthorisedTitle: 'Not available on this account',
    notAuthorisedBody: 'This account does not have access here.',
    backToShop: 'Back to the shop',

    managerTitle: 'Manager',
    managerSub: 'Stock, low-stock alerts and sales.',
    managerDocumentTitle: 'Manager · Forno',

    adminTitle: 'Admin',
    chefTitle: 'Chef',
    adminSub: 'Menu, orders and sales reports.',
    adminDocumentTitle: 'Admin · Forno',

    errors: {
      emailRequired: 'Enter your email',
      emailInvalid: 'That email does not look right',
      passwordRequired: 'Enter your password',
      signInFailed: 'That email and password did not match.',
    },

    /** FR-6.3 / FR-7.5 — current stock levels. */
    stock: {
      title: 'Stock levels',
      subtitle: 'Every ingredient, most urgent first.',

      colIngredient: 'Ingredient',
      colStock: 'In stock',
      colThreshold: 'Low at',
      colStatus: 'Status',

      statusOut: 'Out of stock',
      statusLow: 'Running low',
      statusOk: 'In stock',

      summary: (total, low, out) =>
        `${total} ingredient${total === 1 ? '' : 's'} · ${low} running low · ${out} out of stock`,

      searchLabel: 'Search ingredients',
      filterLabel: 'Show',
      filterNeeds: 'Needs ordering',
      filterAll: 'All',
      showing: (shown, total) => `Showing ${shown} of ${total}`,
      noMatch: (query) => `Nothing matches “${query}”.`,
      nothingLow: 'Nothing needs ordering right now.',
      colBookIn: 'Add stock',

      /* Beside the meter. Says in words what the bar says in pixels, which is
         also why the bar itself is hidden from assistive technology — one fact,
         announced once. "0.9× reorder level" on a low row reads as plainly as
         "5× reorder level" on a healthy one. */
      cover: (times) => `${times}× reorder level`,

      /* Bulk receiving. The owner's review: pressing "Add stock" thirty times
         while a driver waits is not a workflow. */
      bulkLabel: 'Entry mode',
      bulkToggle: 'Bulk receive',
      colArrived: 'Arrived',
      bulkNote:
        'Type what arrived beside each ingredient, then save the delivery once. Clearing a box takes that line off.',

      loading: 'Loading stock levels…',
      empty: 'No ingredients yet.',
      retry: 'Try again',

      errors: {
        not_staff: 'This account cannot view stock levels.',
        unknown: 'Could not load stock levels. Check your connection and try again.',
      },
    },

    /**
     * FR-6.2 — booking in a delivery. Manager only.
     *
     * A delivery note arrives with several lines on it, so the sheet takes
     * several lines. Each one is still its own receive_stock() call: the
     * database knows about stock arriving, not about deliveries.
     */
    receive: {
      title: 'This delivery',
      subtitle: 'Adds to stock. It never replaces it.',

      empty: 'Nothing on the sheet yet',
      /* Two hints, because the dashboard has no stock table beside the sheet
         and pointing at one that is not there is worse than saying less. */
      emptyHintTable: 'Press “Add stock” beside an ingredient, or search for one below.',
      emptyHintAlone: 'Search for an ingredient below to start one.',
      /* Bulk mode: the table beside this is taking the quantities, so the sheet
         points there rather than at a button that is no longer on screen. */
      emptyHintBulk: 'Type what arrived in the “Arrived” column, then save here.',

      add: 'Add stock',
      added: 'On the sheet',
      addAria: (name) => `Add stock of ${name} to this delivery`,
      addedAria: (name) => `${name} is already on this delivery`,
      removeAria: (name) => `Take ${name} off this delivery`,

      quantityAria: (name, unit) => `Quantity of ${name} received, in ${unit}`,
      nowAt: (stock) => `Now ${stock}`,

      /* A preview of a change that has not happened yet, so it is the one place
         the browser works out a stock level for itself. The moment the delivery
         is saved the figure on screen comes from receive_stock()'s own row
         again - see api/inventory.js. */
      afterwards: (before, after) => `${before} → ${after}`,
      /* Two ways to end up fine, and they are not the same sentence: an
         ingredient that was never short did not come "back" from anywhere. */
      stillFine: 'In stock',
      backAbove: 'Back above the threshold',
      willBeLow: 'Still below the threshold',
      willBeOut: 'Still at zero',

      pickerLabel: 'Add something else',
      pickerPlaceholder: 'Start typing a name',
      pickerHint: (total) => `${total} ingredients — typing beats scrolling.`,
      pickerNone: (query) => `Nothing matches “${query}”.`,
      pickerDone: 'Everything is already on this delivery.',
      pickerCount: (n) => `${n} match${n === 1 ? '' : 'es'}`,

      ready: (n) => `${n} line${n === 1 ? '' : 's'} ready`,
      partial: (ready, total) => `${ready} of ${total} filled in`,

      submit: 'Add to stock',
      busy: (done, total) => `Adding ${done} of ${total}…`,

      success: (n) => `Booked in ${n} line${n === 1 ? '' : 's'}. Stock is up to date.`,
      /* Lines go in one at a time, so a failure halfway leaves the earlier ones
         committed. Saying which is the only honest thing to do. */
      someWentIn: (n) => `${n} line${n === 1 ? '' : 's'} went in. These did not:`,
      noneWentIn: 'Nothing was added:',
      failedLine: (name, reason) => `${name} — ${reason}`,

      errors: {
        quantityRequired: 'Enter how much arrived',
        invalid_quantity: 'Enter a quantity greater than zero',
        quantity_too_large: 'That is larger than a single delivery can be',
        ingredient_not_found: 'That ingredient no longer exists',
        not_manager: 'Only the Manager can add stock.',
        not_staff: 'Only the Manager can add stock.',
        unknown: 'Could not add the stock. Check your connection and try again.',
      },
    },

    /** FR-5.4 — low-stock alerts, where they finally get seen. */
    /* Counting the shelf. The only number in this system a recipe did not
       produce — see components/StockCount.jsx for why that matters. */
    count: {
      title: 'Stock count',
      intro:
        'Count what is really on the shelf. Every other figure here is worked out from the recipes, so this is the only one that can tell you they were wrong.',

      booksSay: (quantity) => `Books say ${quantity}`,
      countedLabel: (unit) => `Counted, in ${unit}`,
      noteLabel: 'Note (optional)',
      notePlaceholder: 'Dropped a tray, found a spare box…',

      /* Said before the button, not after. Correcting the running total is the
         right behaviour — a count nobody acts on is a note in a drawer — but it
         is not what somebody expects a form called "count" to do, so it is
         stated while they can still change their mind. */
      willCorrect: 'Saving sets the stock level to your count and records the difference.',

      save: 'Save count',
      saving: 'Saving…',
      cancel: 'Cancel',

      outcomeClean: (counted) => `Counted ${counted}. The books were right.`,
      outcomeOff: (variance, expected, counted) =>
        `${variance}. Books said ${expected}, you counted ${counted}.`,
      outcomeCorrected: 'Stock has been set to your count.',

      /* Its own words rather than the delivery sheet's. The same control doing
         a different job should not claim to be doing that job. */
      picker: {
        pickerLabel: 'Which ingredient?',
        pickerPlaceholder: 'Start typing a name',
        pickerHint: (total) => `${total} ingredients — typing beats scrolling.`,
        pickerNone: (query) => `Nothing matches “${query}”.`,
        pickerDone: 'No ingredients to count.',
        pickerCount: (n) => `${n} match${n === 1 ? '' : 'es'}`,
      },

      errors: {
        not_staff: 'This account cannot record a stock count.',
        invalid_count: 'That is not a quantity this can record.',
        note_too_long: 'That note is too long.',
        ingredient_not_found: 'That ingredient no longer exists.',
        unknown: 'Could not save that count. Check your connection and try again.',
      },
    },

    alerts: {
      title: 'Low stock',
      none: 'Nothing is below its threshold right now.',
      count: (n) => `${n} ingredient${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} reordering`,

      triggered: (when) => `Flagged ${when}`,
      nowAt: (current, threshold) => `Now ${current} · flags at ${threshold}`,
      outNow: 'Out of stock',

      /** Shown only if an open alert somehow sits on a healthy ingredient. */
      staleWarning: 'This ingredient is back above its threshold — refresh the page.',

      loading: 'Loading alerts…',

      errors: {
        not_staff: 'This account cannot view stock alerts.',
        unknown: 'Could not load alerts. Check your connection and try again.',
      },
    },

    /* What is selling, on the dashboard. The panel that took over the space
       the delivery sheet and the all-clear banner used to occupy. */
    topItems: {
      title: 'Selling best',
      subtitle: (days) => `Last ${days} days · by number sold`,
      /* Distinguishes a quiet week from a broken panel. A shop that took no
         orders has no best seller, and saying so is not an error state. */
      empty: (days) => `Nothing sold in the last ${days} days yet.`,
      sold: (n) => `${n} sold`,

      loading: 'Loading…',
      retry: 'Try again',
      errors: {
        not_staff: 'This account cannot view what is selling.',
        invalid_range: 'That window is not one this report can cover.',
        unknown: 'Could not load what is selling. The rest of this page is fine.',
      },
    },

    /* Opening the cancelled figure. See components/CancelledOrders.jsx for
       why the reasons are the customer's rather than the kitchen's. */
    cancelled: {
      intro: (n, days) =>
        `${n} cancelled order${n === 1 ? '' : 's'} in the last ${days} days. All were cancelled by the customer before the kitchen started.`,
      empty: (days) => `No orders were cancelled in the last ${days} days.`,

      colOrder: 'Order',
      colWhen: 'Placed',
      colReason: 'Reason',
      colTotal: 'Total',
      orderNumber: (n) => `#${n}`,
      /* The list scrolls inside its own box, so this says how many are in
         there — a bounded list with no count reads as the whole story. */
      showing: (shown, total) =>
        shown < total
          ? `Showing the ${shown} most recent of ${total}`
          : `${shown} listed, newest first`,

      /* Must match the check constraint on orders.cancelled_reason. A word
         here that the database will not accept is a breakdown row nobody can
         ever land in. */
      reasons: {
        changed_mind: 'Changed their mind',
        ordered_by_mistake: 'Ordered by mistake',
        wrong_details: 'Wrong details',
        too_slow: 'Taking too long',
        other: 'Another reason',
        /* Not a stored value. Covers orders cancelled before the question
           existed, and anybody who declined to answer it. */
        notGiven: 'Not given',
      },

      loading: 'Loading cancellations…',
      retry: 'Try again',
      errors: {
        not_staff: 'This account cannot view cancellations.',
        invalid_range: 'That window is not one this report can cover.',
        unknown: 'Could not load the cancellations. The figures above are fine.',
      },
    },

    /* When the shop is busy, for writing a rota against. */
    dayparts: {
      title: 'When the orders come in',
      subtitle: (days, peak) => `Last ${days} days · busiest at ${peak.toLowerCase()}`,
      empty: (days) => `No orders in the last ${days} days to break down.`,
      /* 24-hour, because a rota is written in 24-hour and "11 – 4" is ambiguous
         in exactly the part of the day this is about. */
      hours: (from, to) =>
        `${String(from).padStart(2, '0')}:00 – ${String(to).padStart(2, '0')}:00`,
      orders: (n) => `${n} order${n === 1 ? '' : 's'}`,

      loading: 'Loading…',
      retry: 'Try again',
      errors: {
        not_staff: 'This account cannot view the day-part breakdown.',
        invalid_range: 'That window is not one this report can cover.',
        unknown: 'Could not load the day-part breakdown.',
      },
    },

    /** FR-6.4 / FR-7.4 — sales reports. */
    sales: {
      title: 'Sales',
      periodLabel: 'Group by',
      periods: {
        day: 'Daily',
        month: 'Monthly',
        year: 'Yearly',
      },

      window: {
        day: 'Last 30 days with orders',
        month: 'Last 12 months with orders',
        year: 'Last 5 years with orders',
      },

      colPeriod: 'Period',
      colOrders: 'Orders',
      colRevenue: 'Revenue',
      colGoods: 'Goods',
      colCancelled: 'Cancelled',

      totalOrders: 'Orders',
      totalRevenue: 'Revenue',
      totalGoods: 'Goods revenue',
      totalCancelled: 'Cancelled',

      /* The chart. role=img with one sentence, because every exact figure it
         encodes is in the table directly underneath — a chart that read out
         thirty numbers would be repeating that table badly. */
      chartAria: (period) =>
        period === 'day'
          ? 'Revenue by day, tallest column is the best day'
          : period === 'month'
            ? 'Revenue by month, tallest column is the best month'
            : 'Revenue by year, tallest column is the best year',
      chartPeak: (label, amount) => `Best: ${label} · ${amount}`,

      goodsNote:
        'Goods revenue excludes delivery fees — it is the figure that matches ingredients used.',
      timeZoneNote: (zone) => `Days start and end in ${zone.replace('_', ' ')}.`,

      empty: 'No orders yet.',
      loading: 'Loading sales…',
      retry: 'Try again',

      errors: {
        not_staff: 'This account cannot view sales reports.',
        invalid_period: 'That grouping is not available.',
        invalid_limit: 'That is too much history to ask for at once.',
        unknown: 'Could not load sales. Check your connection and try again.',
      },
    },

    /**
     * FR-7.2 — the Admin manages the menu.
     *
     * Two screens: an index you scan, and one item you edit on its own URL.
     * The wording avoids the column names - a Manager reads "Position on the
     * menu", not "sort order".
     */
    menu: {
      title: 'Menu',
      countLabel: (total, hidden) =>
        `${total} item${total === 1 ? '' : 's'}${hidden > 0 ? ` · ${hidden} hidden from customers` : ''}`,

      /* ---- the index ---- */
      searchLabel: 'Search the menu',
      filterLabel: 'Show',
      filters: {
        all: 'All',
        live: 'Live',
        hidden: 'Hidden',
        soldOut: 'Sold out',
      },
      showing: (shown, total) => `Showing ${shown} of ${total}`,
      noMatch: 'Nothing matches that.',
      openItem: (name) => `Edit ${name}`,
      sizeCount: (n) => `${n} size${n === 1 ? '' : 's'}`,
      noSizesYet: 'No sizes yet',
      priceRange: (low, high) => (low === high ? low : `${low} – ${high}`),
      noPrice: 'No price yet',
      neverOrdered: 'Never ordered',
      orderedTimes: (n) => `Ordered ${n} time${n === 1 ? '' : 's'}`,

      addItem: 'Add an item',
      newItem: 'New item',
      newItemSub: 'Add the sizes first — an item cannot go live without one.',
      back: 'Menu',

      /* ---- the editor ---- */
      cardCustomer: 'What the customer sees',
      cardSizes: 'Sizes and prices',
      cardPreview: 'Preview',
      previewNote: 'This is the card on the customer menu, live as you type.',
      cardAvailability: 'Availability',
      cardPlacement: 'Where it sits',
      cardDanger: 'Remove this item',

      fieldName: 'Name',
      fieldDescription: 'Description',
      fieldImage: 'Photo',
      imageHint: 'Paste a link. The card above updates, so you can see it landed.',
      fieldCategory: 'Section of the menu',
      categoryHint: 'Pick one that already exists, or type a new one.',
      fieldBadge: 'Label on the card',
      badgeNone: 'No label',
      badgeHint: 'Only these labels appear on the customer menu.',

      fieldPosition: 'Position on the menu',
      positionAt: (place, total) => `${place} of ${total}`,
      positionOrdinal: (n) => {
        const teen = n % 100 >= 11 && n % 100 <= 13
        const suffix = teen ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'
        return `${n}${suffix}`
      },
      moveUp: 'Move up',
      moveDown: 'Move down',
      positionHint: 'The whole menu, not just this section. Saved with the rest.',
      positionNew: 'Set once the item is saved.',

      availability: {
        live: 'Live',
        liveNote: 'On the menu and orderable.',
        soldOut: 'Sold out today',
        soldOutNote: 'Stays on the menu, greyed out. Put it back tomorrow.',
        hidden: 'Hidden',
        hiddenNote: 'Off the menu entirely. Nothing is deleted.',
      },

      /* The engine's flag, shown but never editable here. The choice above
         stays live: the Admin can still hide an item the engine has sold out. */
      autoSoldOut: 'Sold out automatically',
      autoSoldOutNote:
        'An ingredient it needs is at zero, so customers cannot order it whatever is set above. Book in the missing ingredient and it comes back on its own.',

      /* Keyed by the values in lib/menuAvailability.js, so a status indexes
         straight into its own label and a new one cannot go unlabelled. */
      statuses: {
        live: 'Live',
        soldOut: 'Sold out',
        hidden: 'Hidden',
        outOfStock: 'No ingredients',
      },

      colSize: 'Size',
      colPrice: 'Price',
      colServes: 'Serves',
      pricePrefix: 'Rs.',
      addSize: 'Add a size',
      removeSizeAria: (name) => `Remove the ${name || 'new'} size`,
      confirmDropSizeTitle: 'Delete this size and its recipe?',
      confirmDropSizeBody: (names) =>
        `Saving will delete ${names}. The recipe behind it goes too — which ingredients that size uses, and how much of each — and nothing in this panel can put it back. Past orders are unaffected.`,
      confirmDropSizeYes: 'Delete it',
      sizeLocked: (n) => `ordered ${n}×`,
      sizeLockedWhy: 'Kept because past receipts point at it.',
      noSizes: 'No sizes yet — a customer cannot order this until it has one.',
      sizesNote:
        'What the customer picks between. At least one is needed before the item can go live.',

      /* ---- the one save ---- */
      unsaved: 'Unsaved changes',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      discard: 'Discard',

      remove: 'Remove from the menu',
      removing: 'Removing…',
      cannotDelete: (name, n) =>
        `${name} has been ordered ${n} time${n === 1 ? '' : 's'}. Old receipts point at it, so it cannot be deleted — hide it instead and it leaves the menu today.`,
      canDelete: (name) => `${name} has never been ordered, so removing it takes it away for good.`,
      deleteNotSaved: 'Nothing to remove yet — this item has not been saved.',

      confirmRemoveTitle: 'Remove this item?',
      confirmRemoveBody: (name) =>
        `${name} will be taken off the menu and deleted. This cannot be undone.`,
      confirmRemoveYes: 'Remove it',
      confirmLeaveTitle: 'Leave without saving?',
      confirmLeaveBody: 'The changes you made to this item will be lost.',
      confirmLeaveYes: 'Leave',
      cancel: 'Cancel',

      notFound: 'That item is not on the menu.',
      backToMenu: 'Back to the menu',

      loading: 'Loading the menu…',
      empty: 'No menu items yet.',
      retry: 'Try again',

      errors: {
        not_admin: 'Only the Admin can edit the menu.',
        name_required: 'Give the item a name',
        name_too_long: 'That name is too long',
        description_too_long: 'That description is too long',
        category_too_long: 'That category is too long',
        badge_too_long: 'That badge is too long',
        item_not_found: 'That item no longer exists',
        item_has_orders: 'This item has been ordered, so it cannot be deleted. Hide it instead.',
        item_required: 'Choose an item first',
        size_required: 'Give the size a name',
        size_too_long: 'That size name is too long',
        size_not_found: 'That size no longer exists',
        size_has_orders: 'This size has been ordered, so it cannot be deleted.',
        size_has_recipe:
          'That size still has a recipe. Removing it deletes the recipe too, and it cannot be put back from here.',
        size_already_exists: 'That size already exists on this item',
        invalid_price: 'Enter a price of zero or more',
        price_too_large: 'That price is too large',
        unknown: 'Something went wrong. Check your connection and try again.',
      },
    },

    /** FR-7.3 — how busy the shop is right now. */
    active: {
      title: 'Open orders',
      none: 'Nothing in progress right now.',
      total: (n) => `${n} order${n === 1 ? '' : 's'} in progress`,

      colStatus: 'Stage',
      colType: 'Type',

      /* The staff panel's own words. Deliberately not reused from the home
         page hero - editing marketing copy should not relabel an ops table. */
      types: {
        delivery: 'Delivery',
        pickup: 'Pickup',
      },

      colCount: 'Orders',
      colOldest: 'Waiting since',

      loading: 'Loading open orders…',
      retry: 'Try again',

      errors: {
        not_staff: 'This account cannot view open orders.',
        unknown: 'Could not load open orders. Check your connection and try again.',
      },
    },

    /* FR-7.3 extended: the Admin looking at real orders rather than a count.
       Separate from `active` above, which still describes the dashboard's
       how-busy-are-we table. Two screens, two jobs, two vocabularies. */
    orders: {
      searchLabel: 'Search by order number or name',
      filterLabel: 'Show',

      filters: {
        all: 'All',
        active: 'In progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
      },

      /* Appended to the chip so the Admin can see where the orders are before
         clicking a filter that turns out to be empty. */
      filterCount: (label, n) => `${label} (${n})`,

      empty: 'No orders yet.',
      noMatch: 'No orders match that.',
      showing: (shown, total) => `Showing ${shown} of ${total}`,
      /* Said only when the list is full, so nobody reads a capped list as the
         shop's whole history. The cap applies to finished orders only — an
         order still in progress is always listed, however old it is. */
      capped: (n) =>
        `Latest ${n} orders, plus everything still in progress. Older ones are in Reports.`,

      itemCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
      countLabel: (n) => `${n} order${n === 1 ? '' : 's'}`,
      openOrder: (number) => `Open order #${number}`,
      guest: 'Guest',
      hasAccount: 'Account',

      loading: 'Loading orders…',

      errors: {
        not_admin: 'This account cannot view orders.',
        invalid_limit: 'Could not load that many orders.',
        unknown: 'Could not load orders. Check your connection and try again.',
      },

      /* One order, open. */
      detail: {
        back: 'All orders',
        notFoundTitle: 'No such order',
        notFoundBody: 'It may have been deleted. Go back to the list and try again.',

        placedAt: 'Placed',
        stage: 'Stage',
        type: 'Type',

        itemsTitle: 'What was ordered',
        colItem: 'Item',
        colQty: 'Qty',
        colEach: 'Each',
        colLine: 'Total',
        extras: (names) => `+ ${names}`,

        subtotal: 'Subtotal',
        deliveryFee: 'Delivery',
        total: 'Total',

        customerTitle: 'Customer',
        name: 'Name',
        phone: 'Phone',
        address: 'Address',
        notes: 'Notes',
        /* Every order has a name and a phone — checkout requires them of guests
           too. What is optional is the account, so that is what this line is
           about, and it never implies the contact details are missing. */
        email: 'Account',
        orderCount: (n) => `${n} order${n === 1 ? '' : 's'} with us`,
        guestNote: 'Ordered as a guest — no account linked.',

        trailTitle: 'Progress',

        errors: {
          not_admin: 'This account cannot view orders.',
          order_not_found: 'We could not find that order.',
          unknown: 'Could not load that order. Check your connection and try again.',
        },
      },
    },

    /* What the kitchen has actually got through. Read by both the Manager
       (against deliveries) and the Admin (against the sales report), which is
       why the wording names neither of them. */
    usage: {
      /* The panel's own heading, distinct from the section name in the
         sidebar — the same split the stock screen uses ("Stock" / "Stock
         levels"). Repeating one word twice down the page reads as a bug. */
      title: 'Ingredients used',

      searchLabel: 'Search ingredients',
      filterLabel: 'Show',

      /* Which window, and whose midnight decides its ends. The same zone the
         sales report buckets by, which is what makes the two comparable. */
      rangeNote: (label, zone) => `${label} · days start and end in ${zone}`,

      summary: (moved, total) =>
        moved === 0
          ? `Nothing used in this window out of ${total} ingredients`
          : `${moved} of ${total} ingredients used`,

      /* Counting is what makes the variance column mean anything, so a window
         with no counts in it says so rather than showing an empty column and
         letting it read as "all clear". */
      noCounts:
        'Nobody counted a shelf in this window, so there is nothing to check the books against.',
      countsTaken: (counted, total, off) =>
        off === 0
          ? `${counted} of ${total} shelves counted — all matched the books.`
          : `${counted} of ${total} shelves counted · ${off} did not match the books.`,

      onlyUsed: 'Only what moved',
      onlyVariance: 'Off the books',
      showAll: 'Every ingredient',

      colIngredient: 'Ingredient',
      colUsed: 'Used',
      colReceived: 'Received',
      colVariance: 'Counted variance',
      colStock: 'Left in stock',

      /* An ingredient nothing has touched. A dash rather than "0 g", because
         zero of something is a measurement and this is the absence of one. */
      none: '—',

      /* The three states of the variance column, and they are NOT shades of
         one another. Rendering "nobody looked" and "looked, it balanced" the
         same way would turn an unchecked shelf into an all-clear, which is the
         exact misreading this column exists to prevent. */
      notCounted: 'Not counted',
      balanced: 'Matched',
      countedAt: (when) => `Last counted ${when}`,

      empty: 'No ingredients yet.',
      noMatch: 'No ingredients match that.',
      noneUsed: 'Nothing was used in this window.',
      noVariance: 'Every shelf that was counted matched the books.',

      showing: (shown, total) => `Showing ${shown} of ${total}`,

      /* The ledger starts when it is switched on, and says so rather than
         letting an empty first window read as a broken screen. */
      ledgerNote: 'Counts what has moved since stock tracking was switched on.',

      loading: 'Loading usage…',

      errors: {
        not_staff: 'This account cannot view ingredient usage.',
        invalid_range: 'Those dates are not a window this can report on.',
        range_too_long: 'That window is longer than a year. Choose a shorter one.',
        unknown: 'Could not load usage. Check your connection and try again.',
      },
    },

    /* The window a report covers. Shared by the usage and sales screens, so
       "last week" cannot mean two different things on two pages. */
    ranges: {
      label: 'Window',
      presets: {
        today: 'Today',
        weekToDate: 'Week to date',
        priorWeek: 'Prior week',
        last7: 'Last 7 days',
        last30: 'Last 30 days',
        custom: 'Custom',
      },
      fromLabel: 'From',
      toLabel: 'To',
      spanned: (from, to) => `${from} – ${to}`,
      invalid: (maxDays) =>
        `Pick an end date on or after the start, and no more than ${maxDays} days apart.`,
    },

    /* The kitchen screen. Written for someone with flour on their hands
       looking at a counter from two feet away, so the words are short and the
       button says what happens rather than what it is. */
    chef: {
      title: 'Kitchen',
      panelTitle: 'Chef',
      sub: 'Oldest first. Tap an order when it moves on.',

      none: 'Nothing waiting. The kitchen is clear.',
      loading: 'Loading orders…',

      /* What pressing the button does, phrased as the action rather than the
         stage it lands on. "Mark delivered" is a thing you do; "delivered" is
         a thing an order is. The stage names themselves stay in COPY.track so
         the kitchen and the customer never describe the ladder differently. */
      actions: {
        preparing: 'Start cooking',
        out_for_delivery: 'Out for delivery',
        ready_for_pickup: 'Ready for pickup',
        delivered: 'Mark delivered',
        picked_up: 'Mark picked up',
      },

      waiting: (mins) => (mins < 1 ? 'just now' : `${mins} min`),
      itemCount: (n) => `${n} item${n === 1 ? '' : 's'}`,
      extras: (names) => `+ ${names}`,

      /* Announced to a screen reader after the status actually changed, not
         when the button was pressed — the database has the final say and can
         still refuse. */
      moved: (number, stage) => `Order ${number} is now ${stage}`,

      /* An order someone else moved while this screen was showing the old
         stage. Not an error the chef caused, so it reads as news rather than
         a failure. */
      errors: {
        not_kitchen: 'This account cannot update orders.',
        order_not_found: 'That order is no longer there.',
        order_cancelled: 'That order was cancelled.',
        status_not_forward: 'Someone else already moved that one on.',
        invalid_status: 'That stage does not apply to this order.',
        already_final: 'That order is already finished.',
        unknown: 'Could not update that order. Check your connection.',
      },

      loadErrors: {
        not_kitchen: 'This account cannot see the kitchen.',
        unknown: 'Could not load orders. Check your connection and try again.',
      },

      /* Said once under the list rather than beside every order. */
      liveNote: 'This screen keeps itself up to date.',
    },

    /** FR-7.5 — the Admin sees inventory but cannot touch it. */
    inventory: {
      readOnlyNote: 'Read-only. Stock is added by the Manager.',
    },

    /**
     * Sidebar labels. Plain nouns, not instructions: a person recognises
     * "Stock" faster than "Manage inventory", and the verb adds nothing
     * once you are already looking at the section.
     */
    nav: {
      dashboard: 'Dashboard',
      stock: 'Stock',
      sales: 'Sales',
      orders: 'Orders',
      menu: 'Menu',
      inventory: 'Inventory',
      usage: 'Usage',
      kitchen: 'Kitchen',
      reports: 'Reports',
      sectionsLabel: 'Sections',
      badgeLabel: (n, what) => `${n} ${what} need attention`,
    },

    /** The first screen of each panel: is anything wrong, and how is today going. */
    dashboard: {
      managerTitle: 'Today at Forno',
      adminTitle: 'Today at Forno',
      subtitle: (dateText) => `${dateText} · what needs you now`,

      needsReordering: 'Needs reordering',
      needsReorderingNone: 'Everything is stocked',
      needsReorderingSome: (name) => `${name} is lowest`,
      needsReorderingOut: (name) => `${name} is out`,

      ordersToday: 'Orders today',
      revenueToday: 'Revenue today',
      goodsOf: (amount) => `${amount} goods`,
      noOrdersYet: 'No orders yet today',

      /* The comparison behind each trend line. Against the SAME WEEKDAY,
         because trade runs on a weekly cycle and six orders is a fine Tuesday
         and a poor Saturday — comparing today to yesterday would say nothing.
         `samples` is printed because two Wednesdays is not yet a pattern and
         the reader deserves to see what the claim rests on. */
      pacingAhead: (percent, samples, weekday) =>
        `${percent}% ahead of ${samplesText(samples, weekday)}`,
      pacingBehind: (percent, samples, weekday) =>
        `${percent}% behind ${samplesText(samples, weekday)}`,
      pacingLevel: (samples, weekday) => `About the same as ${samplesText(samples, weekday)}`,
      /* Shown when the usual figure is zero, where a percentage would be a
         division by nothing dressed up as insight. */
      pacingFromNothing: 'First orders on this day of the week',
      /* Not enough history to compare against. Says so rather than printing a
         confident 0% invented from a single sample. */
      pacingNoHistory: 'No history for this day yet',

      openNow: 'Open right now',
      openNoneNow: 'Nothing in progress',
      oldestWaiting: (timeText) => `Oldest since ${timeText}`,

      liveOnMenu: 'Live on the menu',
      menuBreakdown: (hidden, unavailable) =>
        [
          hidden > 0 ? `${hidden} hidden` : null,
          unavailable > 0 ? `${unavailable} unavailable` : null,
        ]
          .filter(Boolean)
          .join(', ') || 'All items available',

      stockProblems: 'Stock problems',
      stockProblemsNone: 'Nothing below threshold',

      weekTitle: 'Last seven days',
      weekSub: 'Orders per day',
      weekAria: (min, max) => `Orders per day over the last seven days, between ${min} and ${max}`,

      seeAllStock: 'See all stock',
      seeAllOrders: 'See all orders',

      loading: 'Loading…',
      retry: 'Try again',
      error: 'Could not load this. Check your connection and try again.',
    },

    /** Page headings for each section. */
    pages: {
      stockTitle: 'Stock',
      stockSub: (total) => `All ${total} ingredients · most urgent first`,
      salesTitle: 'Sales',
      salesSub: 'Orders and revenue, to check against the stock they used',
      ordersTitle: 'Orders',
      ordersSub: 'Recent orders, newest first',
      menuTitle: 'Menu',
      inventoryTitle: 'Inventory',
      inventorySub: 'What the kitchen has right now',
      usageTitle: 'Usage',
      usageSub: 'What the kitchen has got through',
      reportsTitle: 'Reports',
      reportsSub: 'How the shop is doing over time',
    },
  },
}
