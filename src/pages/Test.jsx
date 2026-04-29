import React, { useEffect, useState } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

function Test() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="p-8">
      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <div className="text-gray-800">
          User: {user ? user.email : "None (not logged in)"}
        </div>
      )}
      <Text>Test Page</Text>
    </div>
  );
}

export default Test;
