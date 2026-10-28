import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id, not bcrypt: bcrypt silently truncates at 72 bytes, which a password manager
 * will hit. `@node-rs/argon2` specifically, because it ships prebuilt binaries — the
 * Dockerfile's `node:22-slim` runtime stage has no toolchain to compile a native addon.
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      // A malformed stored hash must read as "wrong password", never as a 500.
      return false;
    }
  }
}
