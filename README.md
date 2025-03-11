# 🔧 Perforce Friend

A modern web client for Perforce version control.

> ⚠️ **Platform Note:** Currently **Windows only**. Not yet tested on macOS/Linux. Contributions for cross-platform support welcome!

---

## 💡 Why This Project Exists

I built this out of **frustration with the official Perforce client**. Finding modified-but-not-checked-out files was unnecessarily difficult.

This is my side project to create a **better developer experience** with Perforce. I welcome contributions from anyone who wants to help improve it!

---

## ✨ Key Features

* **Connect** to Perforce servers
* **Browse** workspaces and files
* **Track** checked out files
* **Find** modified files not yet checked out

### 🔍 Smart File Management

* **Sort** by clicking any column header
* **Filter** by status/action
* **Exclude** specific folders
* **Paginate** large file lists
* **Fixed-width** tables for stable UI

### 💾 Helpful Tools

* **Persistent settings** in local storage
  * Sort preferences
  * Items per page
  * Excluded folders
  * Login session
* **Copy paths** with one click
* **Open files** directly from the web UI
* **Color-coded** status indicators

---

## 🚀 Getting Started

### Prerequisites

* **Windows** (Windows 10 or newer)
* **Node.js** 18.18.0+
* `npm`, `yarn`, or `pnpm`
* **Perforce server** to connect to
* **p4 command-line client** in your PATH

### Quick Install

1️⃣ **Clone the repository:**
```bash
git clone https://github.com/Plimsky/Perforce-Friend.git
cd perforce-friend
```

2️⃣ **Install dependencies:**
```bash
npm install
# or yarn install
# or pnpm install
```

3️⃣ **Start the development server:**
```bash
npm run dev
# or yarn dev
# or pnpm dev
```

4️⃣ **Open [http://localhost:3000](http://localhost:3000)** in your browser

---

## 🔐 Connecting to Perforce

You'll need:
* **Server address** (host:port)
* **Username**
* **Password**
* **Workspace name** (optional)

> 💡 Your login session is saved in local storage - no need to reconnect each time!

---

## 📂 File Management

### Checked Out Files

View all files checked out in your workspace:
* **Sort** by file name, action, revision, changelist, or path
* **Filter** by action type (edit, add, delete)
* **Page** through large lists
* **Color-coded** action labels

### Modified Files

Find files modified but not checked out:
* **Sort** by file name, status, or path
* **Filter** by status type
* **Exclude** folders from view
* **One-click** checkout option
* **Common folder exclusions** with presets

---

## 🛠️ Development

Built with:
* **Next.js** - React framework
* **TypeScript** - Type safety
* **Tailwind CSS** - Styling
* **ESLint** - Code quality

👉 For debugging help, see [DEBUGGING.md](DEBUGGING.md)

---

## 🤝 Contributing

**All contributions welcome!** This is a side project I'm sharing with the community.

Help with:
* Bug fixes
* New features
* Documentation
* Cross-platform testing

👉 See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines

---

## 🔮 Future Plans

- [ ] **Add tests**
- [ ] **Cross-platform** support (macOS/Linux)
- [ ] **File browsing** interface
- [ ] **Changelist** management
- [ ] **Diff viewer** integration
- [ ] **Submission** interface
- [ ] **External diff tools** integration
- [ ] **Light/Dark mode** support

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
