import React, { useEffect, useState } from "react";
import { account } from "../lib/appwrite";
import tets from "../assets/Screenshot 2026-03-17 212139.png";

function Test() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        setLoading(true);
        const userData = await account.get();
        setUser(userData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []); 

  return (
    <div>
      {loading ? (
        <img src={tets} alt="Loading" className="animate-spin w-12 h-12" />
      ) : (
        <div>user: {user ? user.name : "None"}</div>
      )}
    </div>
  );
}

export default Test;
