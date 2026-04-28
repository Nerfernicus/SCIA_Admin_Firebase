import "./Header.css";

const pageTitles = {
  dashboard: "Editorial Health Admin",
  sos: "Editorial Health Admin",
  announcements: "Editorial Health Admin",
  users: "Editorial Health Admin",
  verification: "Editorial Health Admin",
  centers: "Editorial Health Admin",
};

export default function Header({ activePage }) {
  return (
    <header className="header">
      <div className="header-left">
        <span className="header-brand">{pageTitles[activePage]}</span>
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search activity..." />
        </div>
      </div>
      <div className="header-right">
        <button className="icon-btn">🔔</button>
        <button className="icon-btn">⚙</button>
        <div className="avatar">
          <img src="https://api.dicebear.com/7.x/notionists/svg?seed=admin" alt="admin" />
        </div>
      </div>
    </header>
  );
}
