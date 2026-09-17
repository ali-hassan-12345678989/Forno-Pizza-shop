/**
 * Every user-facing string in the app. Screens import from here and never
 * inline text, so wording changes are one edit in one file — and translating
 * later means copying this file, not hunting through components.
 *
 * Anything that depends on shop data is a function taking that data, because
 * the shop's own details live in the database (shop_settings), not here.
 */
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
      phoneRequired: 'Enter a phone number',
      phoneInvalid: 'Enter a Pakistani mobile number, e.g. 0300 1234567',
      addressRequired: 'Enter a delivery address',
      addressTooShort: 'Add a bit more detail so we can find you',
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
      invalid_phone: 'Enter a Pakistani mobile number, e.g. 0300 1234567',
      invalid_address: 'Add a bit more detail so we can find you',
      invalid_notes: 'Notes are too long',
      empty_cart: 'Your cart is empty — add something from the menu first.',
      too_many_lines: 'That is too many different items for one order.',
      item_unavailable: 'Something in your cart just sold out. Check your cart and try again.',
      rate_limited: 'That is a lot of orders at once. Give it a minute and try again.',
      settings_missing: 'We could not reach the kitchen. Please try again.',
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
}
