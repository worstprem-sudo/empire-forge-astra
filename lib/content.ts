export type SectionLayout =
  | "hero"
  | "disciplines"
  | "method"
  | "evidence"
  | "voices"
  | "contact";

export interface Discipline {
  index: string;
  name: string;
  claim: string;
  detail: string;
}

export interface Step {
  index: string;
  name: string;
  duration: string;
  detail: string;
}

export interface Metric {
  value: string;
  suffix?: string;
  label: string;
  note: string;
}

export interface Voice {
  quote: string;
  name: string;
  role: string;
}

export interface SectionContent {
  id: string;
  index: string;
  chapter: string;
  eyebrow: string;
  title: string[];
  body?: string;
  bodyStrong?: string;
  layout: SectionLayout;
  disciplines?: Discipline[];
  steps?: Step[];
  metrics?: Metric[];
  voices?: Voice[];
}

export const BRAND = "Empire Forge Astra";
export const TAGLINE = "Precision copy trading. Directly to your account";

export const SECTIONS: SectionContent[] = [
  {
    id: "drift",
    index: "01",
    chapter: "Copy Trading",
    eyebrow: "Pure XAUUSD copy trading",
    title: ["Precision Trading.", "Directly to Your Account."],
    bodyStrong:
      "Connect your MT5 account to the Empire Forge Astra copy-trading system. When the strategy takes a trade, your connected account can copy it according to your settings.",
    layout: "hero",
  },
  {
    id: "lattice",
    index: "02",
    chapter: "What You Get",
    eyebrow: "Built around one simple idea",
    title: ["Copy the strategy.", "Keep control of your account."],
    body: "A focused copy-trading experience built around XAUUSD, MT5 monitoring and clear account access.",
    layout: "disciplines",
    disciplines: [
      {
        index: "i",
        name: "Automated Copy",
        claim: "Built to follow",
        detail: "When the strategy takes an eligible trade, your connected account can copy it according to your settings.",
      },
      {
        index: "ii",
        name: "MT5 Access",
        claim: "Built to monitor",
        detail: "Use public investor access to check the account, open positions, equity and trade history directly in MetaTrader 5.",
      },
      {
        index: "iii",
        name: "XAUUSD Focus",
        claim: "Built around Gold",
        detail: "The service is centered around XAUUSD so the copy-trading experience stays focused and easy to understand.",
      },
      {
        index: "iv",
        name: "Transparent Setup",
        claim: "Built to verify",
        detail: "Broker, PAMM and copy-trading steps are explained clearly before you connect your account.",
      },
    ],
  },
  {
    id: "flux",
    index: "03",
    chapter: "How It Works",
    eyebrow: "From broker account to copied trade",
    title: ["Open once.", "Copy automatically."],
    body: "Follow the setup in order. Once the connection is ready, you can monitor your account from your broker.",
    layout: "method",
    steps: [
      {
        index: "01",
        name: "Open Broker Account",
        duration: "First",
        detail: "Open your Ultima Markets account through the official Empire Forge Astra referral link.",
      },
      {
        index: "02",
        name: "Fund Your PAMM",
        duration: "$1,000 min",
        detail: "Create the PAMM account and deposit the required minimum capital of $1,000 for the PAMM step.",
      },
      {
        index: "03",
        name: "Set Up Copy Trading",
        duration: "Guided",
        detail: "Follow the copy-trading setup so trades from the Empire Forge Algo master account can be copied to your connected account according to your settings.",
      },
      {
        index: "04",
        name: "Send Connection Details",
        duration: "MT5",
        detail: "Provide the ID, read-only password and server name requested for the copy-trading connection.",
      },
      {
        index: "05",
        name: "Monitor Your Account",
        duration: "Ongoing",
        detail: "Once connected, monitor your account from the broker. Trading has risk; profits are not guaranteed and losses can happen.",
      },
    ],
  },
  {
    id: "horizon",
    index: "04",
    chapter: "Performance",
    eyebrow: "Published HFT LIVE performance data",
    title: ["Numbers you can", "review yourself."],
    body: "Use the published XAUUSD performance figures as a reference point, while remembering that past results do not guarantee future results.",
    layout: "evidence",
    metrics: [
      {
        value: "89",
        suffix: "%",
        label: "Win Rate",
        note: "Published headline figure.",
      },
      {
        value: "600",
        suffix: "K+",
        label: "Pips Delivered",
        note: "Published headline figure.",
      },
      {
        value: "25",
        suffix: "%",
        label: "Performance Fee",
        note: "Published performance fee on profits.",
      },
      {
        value: "700",
        suffix: " USD",
        label: "Website Minimum Deposit",
        note: "Current Empire Forge Astra website threshold.",
      },
    ],
  },
  {
    id: "bloom",
    index: "05",
    chapter: "MT5 Access",
    eyebrow: "Public investor / read-only access",
    title: ["Check the account", "for yourself."],
    body: "Use these public investor credentials to monitor the connected trading account through MetaTrader 5.",
    layout: "voices",
    voices: [
      {
        quote: "360498",
        name: "Investor Login",
        role: "MT5 public investor access",
      },
      {
        quote: "Empire@2968",
        name: "Investor Password",
        role: "MT5 public investor access",
      },
    ],
  },
  {
    id: "mark",
    index: "06",
    chapter: "Start Copy Trading",
    eyebrow: "Open your account and get connected",
    title: ["Ready to copy?", "Start here."],
    body: "Open your Ultima Markets account, complete the PAMM and copy-trading setup, then send the requested read-only connection details.",
    layout: "contact",
  },
];

export const HERO_FACTS = [
  { value: "89%", label: "Win rate" },
  { value: "600K+", label: "Pips delivered" },
  { value: "$700", label: "Minimum deposit" },
  { value: "25%", label: "Performance fee" },
];

export const NAV_LINKS = [
  { label: "How It Works", target: 2 },
  { label: "Performance", target: 3 },
  { label: "MT5 Access", target: 4 },
  { label: "Start", target: 5 },
];

export const CLIENTS = [
  "XAUUSD",
  "MetaTrader 5",
  "Ultima Markets",
  "PAMM",
  "Copy Trading",
  "Empire Forge Algo",
];

export const INVESTOR_ACCESS = {
  login: "360498",
  password: "Empire@2968",
  server: "PRIMEWAVE FX LTD",
  broker: "Ultima Markets",
  platform: "MetaTrader 5",
  telegram: "https://t.me/+q-o4BkXcSpYxZmY1",
  ibAccountUrl:
    "https://www.ultimamarkets.com/accounts/open-live-account/?affid=33822400",
};
