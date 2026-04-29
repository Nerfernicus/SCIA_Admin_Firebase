import React from 'react'
import { account } from '../lib/firebase';
function Login() {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');

    async function handleSubmit(e) {
        e.preventDefault();

        const res = await account.createEmailPasswordSession({
            email: email,
            password: password,
        })

        console.log(res);

    }
    return (
    <div>
        <input type="text" name="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" name="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={handleSubmit}>Login</button>
    </div>
  )
}

export default Login